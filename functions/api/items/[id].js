// GET    /api/items/:id       物品详情
// PATCH  /api/items/:id       标记已出 / 重新上架 / 下架（仅发布者，需 clientId）
// DELETE /api/items/:id       删除物品（仅发布者，需 ?clientId=）

import { json, fail, readJson, getString, nowMs } from "../../_shared/helpers.js";

function rowToItem(r) {
  let images = [];
  try { images = JSON.parse(r.images || "[]"); } catch {}
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    description: r.description,
    category: r.category,
    type: r.type,
    price: r.price,
    community: r.community,
    contactName: r.contact_name,
    contactWechat: r.contact_wechat,
    contactPhone: r.contact_phone,
    images,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function onRequestGet({ env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);
  const row = await env.DB.prepare(
    "SELECT * FROM items WHERE id = ? AND status != 'removed'"
  ).bind(id).first();
  if (!row) return fail("物品不存在", 404);
  return json(rowToItem(row));
}

export async function onRequestPatch({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);

  const body = await readJson(request);
  const clientId = getString(body, "clientId");
  if (!clientId) return fail("需要发布者身份", 401);

  const status = body.status;
  if (!["sold", "available", "removed"].includes(status)) {
    return fail("状态不合法", 400);
  }

  const row = await env.DB.prepare("SELECT owner_id FROM items WHERE id = ?").bind(id).first();
  if (!row) return fail("物品不存在", 404);
  if (row.owner_id !== clientId) return fail("无权操作此物品", 403);

  await env.DB.prepare(
    "UPDATE items SET status = ?, updated_at = ? WHERE id = ?"
  ).bind(status, nowMs(), id).run();

  return json({ ok: true, status });
}

export async function onRequestDelete({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);

  const clientId = new URL(request.url).searchParams.get("clientId");
  if (!clientId) return fail("需要发布者身份", 401);

  const row = await env.DB.prepare("SELECT owner_id FROM items WHERE id = ?").bind(id).first();
  if (!row) return fail("物品不存在", 404);
  if (row.owner_id !== clientId) return fail("无权操作此物品", 403);

  await env.DB.prepare("DELETE FROM items WHERE id = ?").bind(id).run();
  return json({ ok: true });
}
