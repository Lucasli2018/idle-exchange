-- 0003: v0.5.0 —— 轻量账号（昵称 + 口令）
-- 应用于存量库：node scripts/apply-migration.mjs 0003_user_password.sql
-- 幂等：ALTER 重复列会被脚本跳过

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN password_salt TEXT;

CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);
