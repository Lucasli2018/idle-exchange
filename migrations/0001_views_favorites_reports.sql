-- 0001: v0.2.0 —— 浏览量 / 收藏 / 举报
-- 应用于存量库：node scripts/apply-migration.mjs 0001_views_favorites_reports.sql
-- 幂等：ALTER 重复列 / 表已存在会被脚本跳过

ALTER TABLE items ADD COLUMN views INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  TEXT    NOT NULL,
  item_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(client_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_fav_client ON favorites(client_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL,
  client_id  TEXT,
  reason     TEXT,
  created_at INTEGER NOT NULL
);
