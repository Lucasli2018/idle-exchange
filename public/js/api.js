// 全局前端工具（经典 <script> 引入，符号挂全局，供各页面共用）
// 依赖：无。所有页面先引入本文件再引入各自逻辑脚本。

// ============ 常量 ============
const CATEGORIES = ["数码", "家居", "图书", "服饰", "母婴", "运动", "美食", "其他"];
const TYPE_LABELS = {
  sell: "出售",
  free: "免费送",
  exchange: "换物",
  wanted: "求购",
};

// ============ HTTP 客户端 ============
class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl || "";
  }

  async _request(method, path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    let body = opts.body;
    if (body && !(body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetch(this.baseUrl + path, { method, headers, body: body || null });
    } catch (err) {
      throw new ApiError("网络错误：" + err.message, 0, null);
    }
    let data = null;
    const ctype = res.headers.get("content-type") || "";
    if (ctype.includes("application/json")) {
      try { data = await res.json(); } catch {}
    } else {
      data = await res.text();
    }
    if (!res.ok) {
      const msg = (data && data.error) || `请求失败 (${res.status})`;
      throw new ApiError(msg, res.status, data);
    }
    return data;
  }

  get(path) { return this._request("GET", path); }
  post(path, body, opts) { return this._request("POST", path, { ...opts, body }); }
  patch(path, body, opts) { return this._request("PATCH", path, { ...opts, body }); }
  del(path, opts) { return this._request("DELETE", path, opts); }
}

// ============ 用户身份（无登录，用本地 clientId 标识发布者）============
function getClientId() {
  let id = localStorage.getItem("idle_client_id");
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      "u-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    localStorage.setItem("idle_client_id", id);
  }
  return id;
}

function getProfile() {
  try { return JSON.parse(localStorage.getItem("idle_profile") || "{}"); }
  catch { return {}; }
}

function setProfile(profile) {
  localStorage.setItem("idle_profile", JSON.stringify(profile || {}));
}

// ============ Toast ============
function showToast(message, type = "info", duration = 2600) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove("show"), duration);
}

// ============ 工具 ============
function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// 价格/类型展示
function formatPrice(item) {
  if (item.type === "free") return "免费送";
  if (item.type === "exchange") return "换物";
  if (item.type === "wanted") return "求购";
  // sell
  if (item.price == null) return "面议";
  return "¥" + (Number(item.price) % 1 === 0
    ? Number(item.price)
    : Number(item.price).toFixed(2));
}

function formatTime(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = n => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function typeBadgeClass(type) {
  return "badge badge-" + type;
}

// (全局符号：CATEGORIES, TYPE_LABELS, ApiClient, ApiError, getClientId,
//  getProfile, setProfile, showToast, escapeHtml, formatPrice, formatTime, typeBadgeClass)
