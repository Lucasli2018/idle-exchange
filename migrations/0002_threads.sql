-- 0002: v0.4.0 —— 站内私信（会话 + 消息）
-- 应用于存量库：node scripts/apply-migration.mjs 0002_threads.sql
-- 幂等：表已存在会被脚本跳过

CREATE TABLE IF NOT EXISTS conversations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL,
  buyer_id   TEXT    NOT NULL,
  seller_id  TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  last_at    INTEGER NOT NULL,
  UNIQUE(item_id, buyer_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_buyer  ON conversations(buyer_id,  last_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_seller ON conversations(seller_id, last_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  conv_id    INTEGER NOT NULL,
  sender_id  TEXT    NOT NULL,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_id, created_at);
