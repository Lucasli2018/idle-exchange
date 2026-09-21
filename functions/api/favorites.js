// GET /api/favorites?clientId=&limit=&offset=&category=&type=&q=   我的收藏列表
// 返回结构与 /api/items 一致（{items, total, limit, offset}）
// v0.7.2：支持与列表页一致的分类/类型/关键词筛选

import { json, fail, getNumber } from "../_shared/helpers.js";
import { rowToItem } from "../_shared/items.js";

const CATEGORIES = ["数码", "家居", "图书", "服饰", "母婴", "运动", "美食", "其他"];
const TYPES = ["sell", "free", "exchange", "wanted"];

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const clientId = p.get("clientId");
  if (!clientId) return fail("缺少 clientId", 400);
  const limit = Math.min(getNumber(p, "limit", 30), 100);
  const offset = Math.max(getNumber(p, "offset", 0), 0);

  const category = p.get("category");
  const type = p.get("type");
  const q = (p.get("q") || "").trim();

  const where = ["f.client_id = ?", "i.status != 'removed'"];
  const binds = [clientId];
  if (category && CATEGORIES.includes(category)) {
    where.push("i.category = ?");
    binds.push(category);
  }
  if (type && TYPES.includes(type)) {
    where.push("i.type = ?");
    binds.push(type);
  }
  if (q) {
    where.push("(i.title LIKE ? OR i.description LIKE ?)");
    binds.push(`%${q}%`, `%${q}%`);
  }
  const whereSql = "WHERE " + where.join(" AND ");

  const countRes = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM favorites f
     JOIN items i ON i.id = f.item_id
     ${whereSql}`
  ).bind(...binds).first();
  const total = countRes ? countRes.c : 0;

  const rows = await env.DB.prepare(
    `SELECT i.* FROM favorites f
     JOIN items i ON i.id = f.item_id
     ${whereSql}
     ORDER BY f.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...binds, limit, offset).all();

  return json({ items: (rows.results || []).map(r => rowToItem(r, env)), total, limit, offset });
}
