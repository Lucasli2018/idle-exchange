// 管理接口守卫：X-Admin-Key 请求头 == Pages 环境变量 ADMIN_KEY
// 未配置 ADMIN_KEY → 503；不匹配 → 401

export function requireAdmin(request, env) {
  if (!env.ADMIN_KEY) {
    return { error: "管理口令未配置（请在 Pages 环境变量设置 ADMIN_KEY）", status: 503 };
  }
  const key = request.headers.get("x-admin-key") || "";
  if (key !== env.ADMIN_KEY) {
    return { error: "管理口令错误", status: 401 };
  }
  return { ok: true };
}
