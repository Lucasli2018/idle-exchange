// Cloudflare Access JWT 验证（RS256，兼容 ES256）
// CF_Authorization cookie 由 Access 签发，用团队域 /certs 的公钥验证
// 需要 Pages 环境变量：ACCESS_TEAM_DOMAIN（如 xxx.cloudflareaccess.com）、ACCESS_AUD（应用 AUD tag）

let jwksCache = null; // { keys, fetchedAt }

async function getJwks(teamDomain) {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < 3600 * 1000) return jwksCache.keys;
  const res = await fetch(`https://${teamDomain}/certs`);
  if (!res.ok) throw new Error("获取 Access 公钥失败");
  const jwks = await res.json();
  jwksCache = { keys: jwks.keys || [], fetchedAt: now };
  return jwksCache.keys;
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
  const bin = atob(b64 + pad);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

export function getSessionCookie(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)CF_Authorization=([^;]+)/);
  return m ? m[1] : null;
}

// 返回 payload（含 email），失败抛错
export async function verifyAccessJwt(token, teamDomain, aud) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("JWT 格式错误");

  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[0])));
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(parts[1])));

  if (!Array.isArray(payload.aud) || !payload.aud.includes(aud)) throw new Error("AUD 不匹配");
  if ((payload.exp || 0) * 1000 < Date.now()) throw new Error("JWT 已过期");

  // Cloudflare Access 使用 RS256；同时兼容 ES256
  let keyAlg, sigAlg;
  if (header.alg === "RS256") {
    keyAlg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
    sigAlg = { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" };
  } else if (header.alg === "ES256") {
    keyAlg = { name: "ECDSA", namedCurve: "P-256" };
    sigAlg = { name: "ECDSA", hash: "SHA-256" };
  } else {
    throw new Error("不支持的签名算法：" + header.alg);
  }

  const jwks = await getJwks(teamDomain);
  const jwk = jwks.find(k => k.kid === header.kid);
  if (!jwk) throw new Error("找不到匹配的公钥");

  const key = await crypto.subtle.importKey("jwk", jwk, keyAlg, false, ["verify"]);
  const sig = b64urlToBytes(parts[2]);
  const ok = await crypto.subtle.verify(
    sigAlg,
    key,
    sig,
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
  );
  if (!ok) throw new Error("签名验证失败");

  return payload;
}

export function emailOfPayload(payload) {
  return payload.email || null;
}

// ============ 本站邮箱会话（access_session Cookie）============
export const SESSION_COOKIE = "access_session";
const SESSION_TTL = 7 * 86400 * 1000; // 7 天

export function newSessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function sessionCookieHeader(token, maxAgeSec = SESSION_TTL / 1000) {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax`;
}

export function readSessionCookie(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return m ? m[1] : null;
}

// 校验本站会话，返回 {email} 或 null（顺带清理过期行）
export async function getSessionEmail(request, env) {
  const token = readSessionCookie(request);
  if (!token || !env.DB) return null;
  const row = await env.DB.prepare(
    "SELECT email, expires_at FROM access_sessions WHERE token = ?"
  ).bind(token).first();
  if (!row) return null;
  if ((row.expires_at || 0) < Date.now()) {
    await env.DB.prepare("DELETE FROM access_sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { email: row.email };
}
