// POST /api/admin/items/:id   管理操作：下架 / 恢复
// Body: {action: 'remove' | 'restore'}   Header: X-Admin-Key

import { json, fail, readJson, getString, nowMs } from "../../../_shared/helpers.js";
import { requireAdmin } from "../../_guard.js";

export async function onRequestPost({ request, env, params }) {
  const g = requireAdmin(request, env);
  if (!g.ok) return json({ error: g.error }, g.status);

  const id = Number(params.id);
  if (!Number.isInteger(id)) return fail("无效的 id", 400);

  const body = await readJson(request);
  const action = getString(body, "action");
  if (!["remove", "restore"].includes(action)) return fail("action 不合法", 400);

  const row = await env.DB.prepare("SELECT id FROM items WHERE id = ?").bind(id).first();
  if (!row) return fail("物品不存在", 404);

  const status = action === "remove" ? "removed" : "available";
  await env.DB.prepare("UPDATE items SET status = ?, updated_at = ? WHERE id = ?")
    .bind(status, nowMs(), id).run();

  return json({ ok: true, status });
}
