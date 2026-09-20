// GET /api/favorites?clientId=&limit=&offset=   我的收藏列表
// 返回结构与 /api/items 一致（{items, total, limit, offset}）

import { json, fail, getNumber } from "../_shared/helpers.js";
import { rowToItem } from "../_shared/items.js";

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const clientId = p.get("clientId");
  if (!clientId) return fail("缺少 clientId", 400);
  const limit = Math.min(getNumber(p, "limit", 30), 100);
  const offset = Math.max(getNumber(p, "offset", 0), 0);

  const countRes = await env.DB.prepare(
    `SELECT COUNT(*) AS c FROM favorites f
     JOIN items i ON i.id = f.item_id
     WHERE f.client_id = ? AND i.status != 'removed'`
  ).bind(clientId).first();
  const total = countRes ? countRes.c : 0;

  const rows = await env.DB.prepare(
    `SELECT i.* FROM favorites f
     JOIN items i ON i.id = f.item_id
     WHERE f.client_id = ? AND i.status != 'removed'
     ORDER BY f.created_at DESC LIMIT ? OFFSET ?`
  ).bind(clientId, limit, offset).all();

  return json({ items: (rows.results || []).map(rowToItem), total, limit, offset });
}
