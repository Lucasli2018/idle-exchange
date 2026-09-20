// GET  /api/threads/:id?clientId=   会话消息流（仅参与者可读）
// POST /api/threads/:id             会话内回复 {clientId, body}
// 返回消息按时间正序，最多 200 条

import { json, fail, readJson, getString, nowMs } from "../../_shared/helpers.js";

async function requireParticipant(env, convId, clientId) {
  if (!clientId) return { error: "缺少 clientId", status: 400 };
  const conv = await env.DB.prepare(
    "SELECT * FROM conversations WHERE id = ?"
  ).bind(convId).first();
  if (!conv) return { error: "会话不存在", status: 404 };
  if (conv.buyer_id !== clientId && conv.seller_id !== clientId) {
    return { error: "无权访问该会话", status: 403 };
  }
  return { conv };
}

export async function onRequestGet({ request, env, params }) {
  const convId = Number(params.id);
  if (!Number.isInteger(convId)) return fail("无效的会话 id", 400);
  const clientId = new URL(request.url).searchParams.get("clientId");

  const r = await requireParticipant(env, convId, clientId);
  if (r.error) return fail(r.error, r.status);

  const rows = await env.DB.prepare(
    "SELECT sender_id, body, created_at FROM messages WHERE conv_id = ? ORDER BY created_at ASC LIMIT 200"
  ).bind(convId).all();

  const messages = (rows.results || []).map(m => ({
    senderId: m.sender_id,
    mine: m.sender_id === clientId,
    body: m.body,
    createdAt: m.created_at,
  }));

  return json({ convId, messages });
}

export async function onRequestPost({ request, env, params }) {
  const convId = Number(params.id);
  if (!Number.isInteger(convId)) return fail("无效的会话 id", 400);

  const body = await readJson(request);
  const senderId = getString(body, "clientId");
  const text = getString(body, "body");
  if (!text) return fail("消息不能为空", 400);
  if (text.length > 500) return fail("消息过长（≤500 字）", 400);

  const r = await requireParticipant(env, convId, senderId);
  if (r.error) return fail(r.error, r.status);

  const now = nowMs();
  await env.DB.prepare(`
    INSERT INTO messages(conv_id, sender_id, body, created_at) VALUES(?, ?, ?, ?)
  `).bind(convId, senderId, text, now).run();
  await env.DB.prepare("UPDATE conversations SET last_at = ? WHERE id = ?")
    .bind(now, convId).run();

  return json({ ok: true }, 201);
}
