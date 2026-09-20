// POST /api/auth/bind-email   把邮箱绑定到当前设备账号（需有效邮箱会话 Cookie）
// Body: {clientId}
// 邮箱已被其它账号绑定 → 409

import { json, fail, readJson, getString, nowMs } from "../../_shared/helpers.js";
import { getSessionEmail } from "../../_shared/access.js";

export async function onRequestPost({ request, env }) {
  const session = await getSessionEmail(request, env);
  if (!session) return fail("邮箱会话无效或已过期，请重新邮箱登录", 401);

  const body = await readJson(request);
  const clientId = getString(body, "clientId");
  if (!clientId) return fail("缺少 clientId", 400);

  const taken = await env.DB.prepare(
    "SELECT client_id FROM users WHERE email = ? AND client_id != ?"
  ).bind(session.email, clientId).first();
  if (taken) return fail("该邮箱已绑定其它设备账号，请在那台设备上使用，或更换邮箱", 409);

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE client_id = ?"
  ).bind(clientId).first();
  if (existing) {
    await env.DB.prepare("UPDATE users SET email = ? WHERE client_id = ?")
      .bind(session.email, clientId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO users(client_id, email, created_at) VALUES(?, ?, ?)
    `).bind(clientId, session.email, nowMs()).run();
  }

  return json({ ok: true, email: session.email, clientId });
}
