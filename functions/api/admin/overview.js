// GET /api/admin/overview   管理概览：统计 + 举报列表（带物品标题）
// Header: X-Admin-Key

import { json } from "../../_shared/helpers.js";
import { requireAdmin } from "../_guard.js";

export async function onRequestGet({ request, env }) {
  const g = requireAdmin(request, env);
  if (!g.ok) return json({ error: g.error }, g.status);

  const stats = await env.DB.prepare(`
    SELECT
      (SELECT COUNT(*) FROM items WHERE status = 'available')  AS itemsAvailable,
      (SELECT COUNT(*) FROM items WHERE status = 'sold')       AS itemsSold,
      (SELECT COUNT(*) FROM items WHERE status = 'removed')    AS itemsRemoved,
      (SELECT COUNT(*) FROM users)                             AS users,
      (SELECT COUNT(*) FROM conversations)                     AS threads,
      (SELECT COUNT(*) FROM reports)                           AS reports
  `).first();

  const repRows = await env.DB.prepare(`
    SELECT r.id, r.item_id, r.client_id, r.reason, r.created_at,
      i.title AS item_title, i.status AS item_status
    FROM reports r LEFT JOIN items i ON i.id = r.item_id
    ORDER BY r.created_at DESC LIMIT 50
  `).all();

  const reports = (repRows.results || []).map(r => ({
    id: r.id,
    itemId: r.item_id,
    itemTitle: r.item_title || "(已删除)",
    itemStatus: r.item_status,
    by: r.client_id,
    reason: r.reason,
    createdAt: r.created_at,
  }));

  return json({ stats, reports });
}
