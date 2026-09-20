// GET /api/threads?clientId=&limit=   我的会话列表（双方视角统一）
// 返回：{threads:[{...,unread}], total, totalUnread}

import { json, fail, getNumber } from "../../_shared/helpers.js";

export async function onRequestGet({ request, env }) {
  const p = new URL(request.url).searchParams;
  const clientId = p.get("clientId");
  if (!clientId) return fail("缺少 clientId", 400);
  const limit = Math.min(getNumber(p, "limit", 50), 100);

  const rows = await env.DB.prepare(`
    SELECT c.id, c.item_id, c.buyer_id, c.seller_id, c.last_at,
      i.title AS item_title,
      CASE WHEN c.buyer_id = ?1 THEN c.seller_id ELSE c.buyer_id END AS other_id,
      (SELECT nickname FROM users u
        WHERE u.client_id = CASE WHEN c.buyer_id = ?1 THEN c.seller_id ELSE c.buyer_id END
      ) AS other_name,
      (SELECT body FROM messages m WHERE m.conv_id = c.id
        ORDER BY m.created_at DESC LIMIT 1) AS last_body,
      (SELECT COUNT(*) FROM messages m WHERE m.conv_id = c.id
        AND m.sender_id != ?1
        AND m.created_at > CASE WHEN c.buyer_id = ?1 THEN c.buyer_read_at ELSE c.seller_read_at END
      ) AS unread
    FROM conversations c
    JOIN items i ON i.id = c.item_id AND i.status != 'removed'
    WHERE c.buyer_id = ?1 OR c.seller_id = ?1
    ORDER BY c.last_at DESC LIMIT ?2
  `).bind(clientId, limit).all();

  const threads = (rows.results || []).map(r => ({
    id: r.id,
    itemId: r.item_id,
    itemTitle: r.item_title,
    otherId: r.other_id,
    otherName: r.other_name || "用户",
    lastBody: r.last_body || "",
    lastAt: r.last_at,
    unread: r.unread || 0,
  }));

  const totalUnread = threads.reduce((s, t) => s + t.unread, 0);
  return json({ threads, total: threads.length, totalUnread });
}
