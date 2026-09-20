// GET /api/communities   活跃圈子（小区/学校/公司）聚合
// 返回：{communities:[{name, count}]}（仅 30 天内在售物品，最多 20 个）

import { json } from "../_shared/helpers.js";
import { nowMs } from "../_shared/helpers.js";

export async function onRequestGet({ env }) {
  const rows = await env.DB.prepare(`
    SELECT community AS name, COUNT(*) AS count
    FROM items
    WHERE status = 'available' AND created_at > ?
      AND community IS NOT NULL AND community != ''
    GROUP BY community
    ORDER BY count DESC
    LIMIT 20
  `).bind(nowMs() - 30 * 86400 * 1000).all();

  return json({ communities: rows.results || [] });
}
