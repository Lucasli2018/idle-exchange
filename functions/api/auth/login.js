// POST /api/auth/login   登录（昵称 + 口令 → 返回绑定 client_id）
// 登录后前端把本地 clientId 切换为账号 client_id，物品/收藏/会话随之找回

import { json, fail, readJson, getString } from "../../_shared/helpers.js";
import { hashPassword } from "../../_shared/auth.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const nickname = getString(body, "nickname");
  const password = typeof body?.password === "string" ? body.password : "";
  if (!nickname || !password) return fail("昵称与口令不能为空", 400);

  const user = await env.DB.prepare(
    "SELECT client_id, password_hash, password_salt FROM users WHERE nickname = ? AND password_hash IS NOT NULL"
  ).bind(nickname).first();
  if (!user) return fail("账号不存在", 404);

  const hash = await hashPassword(password, user.password_salt || "");
  if (hash !== user.password_hash) return fail("口令错误", 401);

  return json({ ok: true, clientId: user.client_id, nickname });
}
