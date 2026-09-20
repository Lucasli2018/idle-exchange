// D1 + R2 远程初始化脚本
// 用法：
//   设置 CLOUDFLARE_API_TOKEN 环境变量（需 D1 编辑 + R2 编辑权限）
//   node scripts/init-d1.mjs            # 仅应用 schema（DB/R2 必须已存在）
//   node scripts/init-d1.mjs --create   # 不存在则自动创建 D1 数据库与 R2 桶
//
// 幂等：CREATE TABLE IF NOT EXISTS，可重复执行。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ACCT = "332b848d9f5d9ec2808bdb855763eb8e";
const DB_NAME = "idle-exchange-db";
const BUCKET_NAME = "idle-exchange-images";
const CREATE = process.argv.includes("--create");

const token = (process.env.TOKEN_FILE ? readFileSync(process.env.TOKEN_FILE, "utf8").trim() : "")
  || process.env.CLOUDFLARE_API_TOKEN || "";
if (!token) { console.error("缺少 CLOUDFLARE_API_TOKEN 或 TOKEN_FILE"); process.exit(1); }

// 本机到 CF 的链路会间歇性抖动，全部纳入重试
const api = async (path, opts = {}, retries = 8) => {
  let lastErr;
  for (let i = 0; i < retries; i++) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCT}${path}`, {
        ...opts,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(opts.headers || {}) },
      });
      const j = await r.json();
      if (j.success) return j.result;
      lastErr = new Error(JSON.stringify(j.errors));
      if (j.errors?.[0]?.code !== 10000) throw lastErr; // 非 auth 类错误直接抛
    } catch (e) {
      lastErr = e;
      if (e instanceof TypeError === false && !String(e.message).includes("10000")) throw e;
    }
    await new Promise(r => setTimeout(r, 800 * (i + 1)));
    process.stderr.write(`  retry ${i + 1}/${retries}\n`);
  }
  throw lastErr;
};

// 1. 找 / 建 D1 数据库
const dbs = await api("/d1/database");
let db = dbs.find(d => d.name === DB_NAME);
if (!db) {
  if (!CREATE) { console.error(`未找到 ${DB_NAME}，请先创建或加 --create`); process.exit(1); }
  db = await api("/d1/database", { method: "POST", body: JSON.stringify({ name: DB_NAME }) });
  console.log(`已创建 D1 数据库 ${DB_NAME} (${db.uuid})`);
} else {
  console.log(`D1 数据库 ${DB_NAME} (${db.uuid})`);
}

const query = sql =>
  api(`/d1/database/${db.uuid}/query`, { method: "POST", body: JSON.stringify({ sql }) });

// 2. 找 / 建 R2 桶（注意返回结构是 { buckets: [...] }）
const buckets = (await api("/r2/buckets")).buckets || [];
if (!buckets.find(b => b.name === BUCKET_NAME)) {
  if (!CREATE) { console.error(`未找到 R2 桶 ${BUCKET_NAME}，请先创建或加 --create`); process.exit(1); }
  await api("/r2/buckets", { method: "POST", body: JSON.stringify({ name: BUCKET_NAME }) });
  console.log(`已创建 R2 桶 ${BUCKET_NAME}`);
} else {
  console.log(`R2 桶 ${BUCKET_NAME} 已存在`);
}

// 3. 读 schema.sql → 去注释 → 按分号拆语句 → 逐条执行
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const raw = readFileSync(join(root, "schema.sql"), "utf8");
const cleaned = raw.split("\n").filter(l => !l.trimStart().startsWith("--")).join("\n");
const stmts = cleaned.split(";").map(s => s.trim()).filter(Boolean);
console.log(`statements: ${stmts.length}`);

let ok = 0, fail = 0;
for (const s of stmts) {
  try { await query(s); ok++; }
  catch (e) {
    if (/duplicate column|already exists/i.test(e.message)) {
      console.log("SKIP (已存在):", s.slice(0, 70).replace(/\n/g, " "));
    } else {
      fail++;
      console.error(`FAIL: ${e.message}\n  SQL: ${s.slice(0, 90).replace(/\n/g, " ")}`);
    }
  }
}
console.log(`done: ok=${ok} fail=${fail}`);
if (fail) process.exit(1);

// 4. 验证
const v = await query("SELECT (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM items) AS items");
console.log("counts:", JSON.stringify(v[0].results[0]));
console.log("初始化完成 ✅");
