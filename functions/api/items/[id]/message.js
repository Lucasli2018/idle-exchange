// POST /api/items/:id/message   给发布者发私信（自动建会话）
// Body: {clientId, body}  clientId 为发送方（买家），发布者为 seller
// 注：不能给自己发；body ≤ 500 字

import { json, fail, readJson, getString, nowMs, getAccountedUser } from "../../../_shared/helpers.js";

const MAX_LEN = 500;

export async function onRequestPost({ request, env, params }) {
  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);

  const body = await readJson(request);
  const senderId = getString(body, "clientId");
  const text = getString(body, "body");
  const acc = await getAccountedUser(env, senderId);
  if (!acc) return fail("请先登录后再私信", 401);
  if (!text) return fail("消息不能为空", 400);
  if (text.length > MAX_LEN) return fail(`消息过长（≤${MAX_LEN} 字）`, 400);

  const item = await env.DB.prepare(
    "SELECT id, owner_id FROM items WHERE id = ? AND status != 'removed'"
  ).bind(id).first();
  if (!item) return fail("物品不存在", 404);
  if (item.owner_id === senderId) return fail("不能给自己发私信", 400);

  const now = nowMs();
  // 找/建会话：买家对同一物品只有一条会话
  let conv = await env.DB.prepare(
    "SELECT id FROM conversations WHERE item_id = ? AND buyer_id = ?"
  ).bind(id, senderId).first();
  if (!conv) {
    const info = await env.DB.prepare(`
      INSERT INTO conversations(item_id, buyer_id, seller_id, created_at, last_at)
      VALUES(?, ?, ?, ?, ?)
    `).bind(id, senderId, item.owner_id, now, now).run();
    const convId = info.meta?.last_row_id;
    conv = { id: convId };
  }

  await env.DB.prepare(`
    INSERT INTO messages(conv_id, sender_id, body, created_at)
    VALUES(?, ?, ?, ?)
  `).bind(conv.id, senderId, text, now).run();

  await env.DB.prepare("UPDATE conversations SET last_at = ? WHERE id = ?")
    .bind(now, conv.id).run();

  return json({ ok: true, convId: conv.id }, 201);
}
