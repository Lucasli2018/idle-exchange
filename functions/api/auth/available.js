// GET /api/auth/available?nickname=xxx   注册时实时校验账号是否可用
// 返回：{ available: true|false }
// 仅对「已设密码的注册账号」判定占用，未设密码的匿名 client_id 行不视为占用

import { json, fail } from "../../_shared/helpers.js";
import { getString } from "../../_shared/helpers.js";

export async function onRequestGet({ request, env }) {
  const nickname = getString(Object.fromEntries(new URL(request.url).searchParams), "nickname");
  if (!nickname) return fail("缺少账号", 400);
  const row = await env.DB.prepare(
    "SELECT 1 FROM users WHERE nickname = ? AND password_hash IS NOT NULL"
  ).bind(nickname).first();
  return json({ available: !row });
}
