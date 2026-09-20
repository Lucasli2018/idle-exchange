// POST   /api/items/:id/favorite   收藏（Body: {clientId}）
// DELETE /api/items/:id/favorite   取消收藏（?clientId=）

import { json, fail, readJson, getString, nowMs, getAccountedUser } from "../../../_shared/helpers.js";

export async function onRequestPost({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);
  const body = await readJson(request);
  const clientId = getString(body, "clientId");
  const acc = await getAccountedUser(env, clientId);
  if (!acc) return fail("请先登录后再收藏", 401);

  const item = await env.DB.prepare(
    "SELECT id FROM items WHERE id = ? AND status != 'removed'"
  ).bind(id).first();
  if (!item) return fail("物品不存在", 404);

  await env.DB.prepare(`
    INSERT OR IGNORE INTO favorites(client_id, item_id, created_at)
    VALUES(?, ?, ?)
  `).bind(clientId, id, nowMs()).run();

  return json({ ok: true, favorited: true }, 201);
}

export async function onRequestDelete({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);
  const clientId = new URL(request.url).searchParams.get("clientId");
  const acc = await getAccountedUser(env, clientId);
  if (!acc) return fail("请先登录后再操作", 401);

  await env.DB.prepare("DELETE FROM favorites WHERE client_id = ? AND item_id = ?")
    .bind(clientId, id).run();

  return json({ ok: true, favorited: false });
}
