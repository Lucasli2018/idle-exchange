// 共享工具：JSON 响应、错误处理、参数解析、时间工具
// 被各 Functions 以 ESM import 复用（注意相对路径深度）

// ============ JSON helpers ============
export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });
}

export function fail(message, status = 400) {
  return json({ error: message }, status);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

// ============ 参数解析 ============
export function getString(params, key, fallback = "") {
  const v = params[key];
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}

// 取数字参数。兼容普通对象与 URLSearchParams
// （历史 bug：调用方传的是 URLSearchParams，用 params[key] 取不到值 → limit/offset 被静默忽略，
//   列表「加载更多」只会重复第一页。改用 .get() 后修复 v0.7.2）
export function getNumber(params, key, fallback = null) {
  const raw = params && typeof params.get === "function" ? params.get(key) : params?.[key];
  if (raw === null || raw === undefined || raw === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

// 同上，取字符串参数
export function getParam(params, key, fallback = "") {
  const raw = params && typeof params.get === "function" ? params.get(key) : params?.[key];
  return typeof raw === "string" && raw.trim() ? raw.trim() : fallback;
}

// 按允许的枚举校验，不合法返回 fallback
export function pickEnum(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

// ============ 时间工具 ============
// D1 里时间统一存 epoch 毫秒（INTEGER），方便排序
export function nowMs() {
  return Date.now();
}

export function fmtDateTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ============ 校验 ============
// 返回 null 表示通过，否则返回错误字符串
export function validateItemInput(body) {
  if (!body) return "缺少请求体";
  if (!getString(body, "title")) return "标题不能为空";
  if (body.title.length > 60) return "标题过长（≤60 字）";
  const cats = ["数码","家居","图书","服饰","母婴","运动","美食","其他"];
  if (!cats.includes(body.category)) return "分类不合法";
  const types = ["sell","free","exchange","wanted"];
  if (!types.includes(body.type)) return "类型不合法";
  if (body.description && body.description.length > 1000) return "描述过长（≤1000 字）";
  if (body.type === "sell") {
    const p = Number(body.price);
    if (!Number.isFinite(p) || p < 0) return "出售物品需填写有效价格";
  }
  return null;
}

// ============ 登录校验（强制账号登录）============
// 写操作前，校验该 clientId 已绑定账号（password_hash 非空）。
// 返回用户行（client_id/nickname/community）或 null（未登录/匿名）。
export async function getAccountedUser(env, clientId) {
  if (!clientId || typeof clientId !== "string") return null;
  return await env.DB.prepare(
    "SELECT client_id, nickname, community FROM users WHERE client_id = ? AND password_hash IS NOT NULL"
  ).bind(clientId).first();
}
