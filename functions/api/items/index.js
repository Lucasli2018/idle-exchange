// GET  /api/items          列表（支持分类/类型/状态/搜索/我的发布/排序/分页）
// POST /api/items          发布物品
//
// 查询参数：
//   category  分类（数码/家居/图书/服饰/母婴/运动/美食/其他）
//   type      sell|free|exchange|wanted
//   status    available|sold|removed（默认 available；指定 owner 时默认排除 removed）
//   owner     发布者 clientId（我的发布）
//   q         关键词（标题/描述模糊匹配）
//   sort      newest|price_asc|price_desc（默认 newest）
//   limit     每页条数（默认 30，最大 100）
//   offset    偏移

import {
  json, fail, readJson, getString, getNumber,
  nowMs, validateItemInput,
} from "../../_shared/helpers.js";

const CATEGORIES = ["数码", "家居", "图书", "服饰", "母婴", "运动", "美食", "其他"];
const TYPES = ["sell", "free", "exchange", "wanted"];

function rowToItem(r) {
  let images = [];
  try { images = JSON.parse(r.images || "[]"); } catch {}
  // 存储层是 R2 key，展示层统一拼接代理 URL（前端可直接作为 img src）
  images = images.map(k => `/api/files/${encodeURIComponent(k)}`);
  return {
    id: r.id,
    ownerId: r.owner_id,
    title: r.title,
    description: r.description,
    category: r.category,
    type: r.type,
    price: r.price,
    community: r.community,
    contactName: r.contact_name,
    contactWechat: r.contact_wechat,
    contactPhone: r.contact_phone,
    images,
    status: r.status,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;

  const category = p.get("category");
  const type = p.get("type");
  const status = p.get("status");
  const owner = p.get("owner");
  const q = (p.get("q") || "").trim();
  const sort = p.get("sort") || "newest";
  const limit = Math.min(getNumber(p, "limit", 30), 100);
  const offset = Math.max(getNumber(p, "offset", 0), 0);

  const where = [];
  const binds = [];

  if (owner) {
    where.push("owner_id = ?", "status != 'removed'");
    binds.push(owner);
  } else if (status && ["available", "sold", "removed"].includes(status)) {
    where.push("status = ?");
    binds.push(status);
  } else {
    where.push("status = 'available'");
  }

  if (category && CATEGORIES.includes(category)) {
    where.push("category = ?");
    binds.push(category);
  }
  if (type && TYPES.includes(type)) {
    where.push("type = ?");
    binds.push(type);
  }
  if (q) {
    where.push("(title LIKE ? OR description LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";

  let orderSql;
  if (sort === "price_asc") orderSql = "ORDER BY price ASC, created_at DESC";
  else if (sort === "price_desc") orderSql = "ORDER BY price DESC, created_at DESC";
  else orderSql = "ORDER BY created_at DESC";

  const countRes = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM items ${whereSql}`
  ).bind(...binds).first();
  const total = countRes ? countRes.c : 0;

  const rows = await env.DB.prepare(
    `SELECT * FROM items ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  const items = (rows.results || []).map(rowToItem);
  return json({ items, total, limit, offset });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const err = validateItemInput(body);
  if (err) return fail(err, 400);

  const clientId = getString(body, "clientId");
  if (!clientId) return fail("缺少 clientId（发布者标识）", 400);

  const now = nowMs();

  // 同步/补全发布者档案
  await env.DB.prepare(`
    INSERT INTO users(client_id, nickname, community, created_at)
    VALUES(?, ?, ?, ?)
    ON CONFLICT(client_id) DO UPDATE SET
      nickname = COALESCE(excluded.nickname, users.nickname),
      community = COALESCE(excluded.community, users.community)
  `).bind(clientId, getString(body, "nickname"), getString(body, "community"), now).run();

  const images = Array.isArray(body.images) ? body.images.filter(Boolean).slice(0, 9) : [];

  const info = await env.DB.prepare(`
    INSERT INTO items(owner_id, title, description, category, type, price,
      community, contact_name, contact_wechat, contact_phone, images, status, created_at, updated_at)
    VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?, ?)
  `).bind(
    clientId,
    getString(body, "title"),
    getString(body, "description"),
    body.category,
    body.type,
    body.type === "sell" ? Number(body.price) : null,
    getString(body, "community"),
    getString(body, "contactName"),
    getString(body, "contactWechat"),
    getString(body, "contactPhone"),
    JSON.stringify(images),
    now, now
  ).run();

  const id = info.meta?.last_row_id ?? null;
  return json({ id, ok: true }, 201);
}
