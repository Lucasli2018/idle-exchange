// GET    /api/items/:id       物品详情
// PATCH  /api/items/:id       标记已出 / 重新上架 / 下架（仅发布者，需 clientId）
// DELETE /api/items/:id       删除物品（仅发布者，需 ?clientId=）

import { json, fail, readJson, getString, nowMs } from "../../_shared/helpers.js";
import { rowToItem } from "../../_shared/items.js";

export async function onRequestGet({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);
  const row = await env.DB.prepare(
    "SELECT * FROM items WHERE id = ? AND status != 'removed'"
  ).bind(id).first();
  if (!row) return fail("物品不存在", 404);

  // 浏览量自增（详情页每次访问 +1）
  await env.DB.prepare("UPDATE items SET views = views + 1 WHERE id = ?")
    .bind(id).run();

  // 可选：带 clientId 时返回收藏状态
  const clientId = new URL(request.url).searchParams.get("clientId");
  let favorited = false;
  if (clientId) {
    const fav = await env.DB.prepare(
      "SELECT 1 FROM favorites WHERE client_id = ? AND item_id = ?"
    ).bind(clientId, id).first();
    favorited = !!fav;
  }

  const item = rowToItem(row);
  item.views = (row.views || 0) + 1;
  item.favorited = favorited;
  return json(item);
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
