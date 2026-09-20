// GET /api/access-login   Cloudflare Access 登录回跳点
// 此路径被 Access 应用保护（path: /api/access-login）：
//   未登录 → Access 重定向到 OTP 登录页；输邮箱收一次性验证码后放行回来
// 已登录 → 本接口验证 CF_Authorization JWT，建立 7 天会话 Cookie，回跳 /auth.html?access=1
//
// 需要 Pages 环境变量：ACCESS_TEAM_DOMAIN、ACCESS_AUD（未配置时返回 503 引导）

import { json, fail } from "../_shared/helpers.js";
import {
  getSessionCookie, verifyAccessJwt, emailOfPayload,
  newSessionToken, sessionCookieHeader,
} from "../_shared/access.js";
import { nowMs } from "../_shared/helpers.js";

export async function onRequestGet({ request, env }) {
  const team = env.ACCESS_TEAM_DOMAIN;
  const aud = env.ACCESS_AUD;
  if (!team || !aud) {
    return json({ error: "邮箱登录未启用：请配置 Pages 环境变量 ACCESS_TEAM_DOMAIN 与 ACCESS_AUD" }, 503);
  }

  const jwt = getSessionCookie(request);
  if (!jwt) return fail("未检测到 Access 凭据", 401);

  let email;
  try {
    const payload = await verifyAccessJwt(jwt, team, aud);
    email = emailOfPayload(payload);
  } catch (e) {
    return fail("Access 验证失败：" + e.message, 401);
  }
  if (!email) {
    // 部分签发的 JWT payload 不含 email，走同域 get-identity 兜底
    try {
      const idRes = await fetch(new URL("/cdn-cgi/access/get-identity", request.url), {
        headers: { cookie: `CF_Authorization=${jwt}` },
      });
      if (idRes.ok) {
        const identity = await idRes.json();
        email = identity.email || null;
      }
    } catch {}
  }
  if (!email) return fail("Access 凭据中缺少邮箱信息", 401);

  const token = newSessionToken();
  const now = nowMs();
  await env.DB.prepare(`
    INSERT INTO access_sessions(token, email, created_at, expires_at) VALUES(?, ?, ?, ?)
  `).bind(token, email, now, now + 7 * 86400 * 1000).run();

  return new Response(null, {
    status: 302,
    headers: {
      Location: "/auth.html?access=1",
      "Set-Cookie": sessionCookieHeader(token),
      "Cache-Control": "no-store",
    },
  });
}
