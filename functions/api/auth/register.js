// POST /api/auth/register   注册（绑定当前 clientId + 设置账号/密码）
// Body: {clientId, nickname, password, community?}
// 规则：账号（昵称）2-20 字且未被注册账号占用（409）；密码 ≥ 6 位
// 注册成功后该 clientId 名下物品的联系昵称同步更新

import { json, fail, readJson, getString } from "../../_shared/helpers.js";
import { hashPassword, randomSalt } from "../../_shared/auth.js";
import { nowMs } from "../../_shared/helpers.js";

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const clientId = getString(body, "clientId");
  const nickname = getString(body, "nickname");
  const password = typeof body?.password === "string" ? body.password : "";
  if (!clientId) return fail("缺少 clientId", 400);
  if (!nickname || nickname.length < 2 || nickname.length > 20) return fail("账号需 2-20 字", 400);
  if (password.length < 6) return fail("密码至少 6 位", 400);

  // 账号（昵称）是否已被注册账号占用
  const taken = await env.DB.prepare(
    "SELECT 1 FROM users WHERE nickname = ? AND password_hash IS NOT NULL AND client_id != ?"
  ).bind(nickname, clientId).first();
  if (taken) return fail("该账号已被占用", 409);

  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  const now = nowMs();

  // upsert：已存在该 clientId 行则更新，否则插入
  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE client_id = ?"
  ).bind(clientId).first();
  if (existing) {
    await env.DB.prepare(`
      UPDATE users SET nickname = ?, community = COALESCE(?, community),
        password_hash = ?, password_salt = ? WHERE client_id = ?
    `).bind(nickname, getString(body, "community") || null, hash, salt, clientId).run();
  } else {
    await env.DB.prepare(`
      INSERT INTO users(client_id, nickname, community, password_hash, password_salt, created_at)
      VALUES(?, ?, ?, ?, ?, ?)
    `).bind(clientId, nickname, getString(body, "community") || null, hash, salt, now).run();
  }

  // 名下物品的联系昵称同步
  await env.DB.prepare("UPDATE items SET contact_name = ? WHERE owner_id = ?")
    .bind(nickname, clientId).run();

  return json({ ok: true, clientId, nickname });
}
