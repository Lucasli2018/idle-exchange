// 全局中间件：CORS、错误兜底、本地开发自动建表
// Pages Functions 的 _middleware.js 会在每个请求前执行

let initializing = false;
let dbReady = false;

async function ensureDatabase(env) {
  if (dbReady || initializing) return;
  initializing = true;
  try {
    // 幂等建表（每次冷启动执行一次，已存在则跳过）
    const statements = [
      `CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id     TEXT    NOT NULL UNIQUE,
        nickname      TEXT,
        community     TEXT,
        password_hash TEXT,
        password_salt TEXT,
        email         TEXT,
        created_at    INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL`,
      `CREATE TABLE IF NOT EXISTS access_sessions (
        token      TEXT PRIMARY KEY,
        email      TEXT    NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_access_sessions_exp ON access_sessions(expires_at)`,
      `CREATE TABLE IF NOT EXISTS items (
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
      )`,
      `CREATE INDEX IF NOT EXISTS idx_items_category ON items(category)`,
      `CREATE INDEX IF NOT EXISTS idx_items_type     ON items(type)`,
      `CREATE INDEX IF NOT EXISTS idx_items_status   ON items(status)`,
      `CREATE INDEX IF NOT EXISTS idx_items_owner    ON items(owner_id)`,
      `CREATE INDEX IF NOT EXISTS idx_items_created  ON items(created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS favorites (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id  TEXT    NOT NULL,
        item_id    INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(client_id, item_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_fav_client ON favorites(client_id, created_at DESC)`,
      `CREATE TABLE IF NOT EXISTS reports (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id    INTEGER NOT NULL,
        client_id  TEXT,
        reason     TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS conversations (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        item_id        INTEGER NOT NULL,
        buyer_id       TEXT    NOT NULL,
        seller_id      TEXT    NOT NULL,
        created_at     INTEGER NOT NULL,
        last_at        INTEGER NOT NULL,
        buyer_read_at  INTEGER NOT NULL DEFAULT 0,
        seller_read_at INTEGER NOT NULL DEFAULT 0,
        UNIQUE(item_id, buyer_id)
      )`,
      `CREATE INDEX IF NOT EXISTS idx_conv_buyer  ON conversations(buyer_id,  last_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_conv_seller ON conversations(seller_id, last_at DESC)`,
      `CREATE TABLE IF NOT EXISTS messages (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        conv_id    INTEGER NOT NULL,
        sender_id  TEXT    NOT NULL,
        body       TEXT    NOT NULL,
        created_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS idx_msg_conv ON messages(conv_id, created_at)`,
    ];

    for (const sql of statements) {
      await env.DB.prepare(sql).run();
    }

    // 幂等补列（存量库升级）
    const upgrades = [
      { table: "items", column: "views", ddl: "ALTER TABLE items ADD COLUMN views INTEGER NOT NULL DEFAULT 0" },
      { table: "users", column: "password_hash", ddl: "ALTER TABLE users ADD COLUMN password_hash TEXT" },
      { table: "users", column: "password_salt", ddl: "ALTER TABLE users ADD COLUMN password_salt TEXT" },
      { table: "users", column: "email", ddl: "ALTER TABLE users ADD COLUMN email TEXT" },
      { table: "conversations", column: "buyer_read_at", ddl: "ALTER TABLE conversations ADD COLUMN buyer_read_at INTEGER NOT NULL DEFAULT 0" },
      { table: "conversations", column: "seller_read_at", ddl: "ALTER TABLE conversations ADD COLUMN seller_read_at INTEGER NOT NULL DEFAULT 0" },
    ];
    for (const u of upgrades) {
      const cols = await env.DB.prepare(`PRAGMA table_info(${u.table})`).all();
      if (!cols.results.some(c => c.name === u.column)) {
        await env.DB.prepare(u.ddl).run();
        console.log(`[middleware] 已升级 ${u.table}.${u.column}`);
      }
    }

    dbReady = true;
  } catch (err) {
    console.error("[middleware] 数据库初始化失败:", err);
  } finally {
    initializing = false;
  }
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const origin = request.headers.get("origin") || "*";

  // Preflight
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "86400",
      },
    });
  }

  // 首次访问自动建表（生产库已有 items 表时会直接跳过，仅多一次轻量查询）
  if (env.DB) {
    await ensureDatabase(env);
  }

  // 响应加 CORS 头
  const originalNext = context.next;
  context.next = async (nextContext) => {
    const response = await originalNext(nextContext);
    response.headers.set("Access-Control-Allow-Origin", origin);
    response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.headers.set("Access-Control-Max-Age", "86400");
    return response;
  };

  return context.next();
}
