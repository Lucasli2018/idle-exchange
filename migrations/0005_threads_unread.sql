-- 0005: v0.6.1 —— 私信未读数
-- 应用于存量库：node scripts/apply-migration.mjs 0005_threads_unread.sql
-- 幂等：ALTER 重复列会被脚本跳过

ALTER TABLE conversations ADD COLUMN buyer_read_at  INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversations ADD COLUMN seller_read_at INTEGER NOT NULL DEFAULT 0;
