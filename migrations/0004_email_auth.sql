-- 0004: v0.6.0 —— 邮箱登录（Cloudflare Access OTP）
-- 应用于存量库：node scripts/apply-migration.mjs 0004_email_auth.sql
-- 幂等：ALTER 重复列会被脚本跳过

ALTER TABLE users ADD COLUMN email TEXT;

-- 一个邮箱只能绑定一个账号（未绑定的为 NULL，不参与唯一约束）
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL;

-- Access OTP 会话（HttpOnly Cookie 凭据）
CREATE TABLE IF NOT EXISTS access_sessions (
  token      TEXT PRIMARY KEY,
  email      TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_access_sessions_exp ON access_sessions(expires_at);
