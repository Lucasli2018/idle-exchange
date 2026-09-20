// POST /api/items/:id/report   举报物品（Body: {clientId?, reason}）
// 举报仅存档，供后续管理后台处理（v0.5）

import { json, fail, readJson, getString, nowMs, getAccountedUser } from "../../../_shared/helpers.js";

export async function onRequestPost({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);
  const body = await readJson(request);
  const clientId = getString(body, "clientId");
  const acc = await getAccountedUser(env, clientId);
  if (!acc) return fail("请先登录后再举报", 401);
  const reason = getString(body, "reason");
  if (!reason) return fail("请填写举报原因", 400);
  if (reason.length > 200) return fail("举报原因过长（≤200 字）", 400);

  const item = await env.DB.prepare(
    "SELECT id FROM items WHERE id = ? AND status != 'removed'"
  ).bind(id).first();
  if (!item) return fail("物品不存在", 404);

  await env.DB.prepare(`
    INSERT INTO reports(item_id, client_id, reason, created_at)
    VALUES(?, ?, ?, ?)
  `).bind(id, clientId, reason, nowMs()).run();

  return json({ ok: true }, 201);
}
