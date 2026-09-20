-- 社区二手 / 闲置交换平台 D1 schema（全量快照，v0.2.0）
-- 由 scripts/init-d1.mjs 读取并应用到线上 D1 数据库（幂等可重跑）
-- 本地开发由 functions/_middleware.js 幂等建表 + 补列（二者保持一致）
-- 存量库增量升级用 migrations/0001_views_favorites_reports.sql

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id     TEXT    NOT NULL UNIQUE,
  nickname      TEXT,
  community     TEXT,
  password_hash TEXT,
  password_salt TEXT,
  created_at    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);

CREATE TABLE IF NOT EXISTS items (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     TEXT    NOT NULL,
  title        TEXT    NOT NULL,
  description  TEXT,
  category     TEXT    NOT NULL
                 CHECK (category IN ('数码','家居','图书','服饰','母婴','运动','美食','其他')),
  type         TEXT    NOT NULL
                 CHECK (type IN ('sell','free','exchange','wanted')),
  price        REAL,
  community    TEXT,
  contact_name    TEXT,
  contact_wechat TEXT,
  contact_phone  TEXT,
  images       TEXT    NOT NULL DEFAULT '[]',
  status       TEXT    NOT NULL DEFAULT 'available'
                 CHECK (status IN ('available','sold','removed')),
  views        INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_type     ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_status   ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_owner    ON items(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_created  ON items(created_at DESC);

-- 收藏（client_id 为浏览器本地身份）
CREATE TABLE IF NOT EXISTS favorites (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  TEXT    NOT NULL,
  item_id    INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(client_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_fav_client ON favorites(client_id, created_at DESC);

-- 举报（存档供后台处理，v0.5 管理端消费）
CREATE TABLE IF NOT EXISTS reports (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id    INTEGER NOT NULL,
  client_id  TEXT,
  reason     TEXT,
  created_at INTEGER NOT NULL
);

-- 站内私信（v0.4.0）：买家对物品的会话，卖家即物品 owner
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
