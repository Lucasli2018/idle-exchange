// 口令哈希（PBKDF2-SHA256, 100k 轮）与随机盐
// Workers Web Crypto 原生，无外部依赖

export async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: enc.encode(salt), iterations: 100000 },
    key, 256
  );
  return [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, "0")).join("");
}

export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map(b => b.toString(16).padStart(2, "0")).join("");
}
