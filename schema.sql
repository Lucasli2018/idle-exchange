-- 社区二手 / 闲置交换平台 D1 schema
-- 由 scripts/init-d1.mjs 读取并应用到线上 D1 数据库
-- 本地开发由 functions/_middleware.js 自动建表（二者保持一致）

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id  TEXT    NOT NULL UNIQUE,
  nickname   TEXT,
  community  TEXT,
  created_at INTEGER NOT NULL
);

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
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_items_category ON items(category);
CREATE INDEX IF NOT EXISTS idx_items_type     ON items(type);
CREATE INDEX IF NOT EXISTS idx_items_status   ON items(status);
CREATE INDEX IF NOT EXISTS idx_items_owner    ON items(owner_id);
CREATE INDEX IF NOT EXISTS idx_items_created  ON items(created_at DESC);
