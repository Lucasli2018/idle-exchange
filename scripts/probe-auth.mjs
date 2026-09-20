// 鉴权探针（本地开发用，零依赖）
// 用途：验证「强制账号登录」改造 —— 浏览公开、写操作需登录、登录后写成功。
// 运行：先起本服务 `wrangler pages dev --port 8803 --persist-to ./.wrangler-dev-state`
//       再 `node scripts/probe-auth.mjs`
// 说明：每次运行使用随机账号，可重复执行；全部通过退出码 0。

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8803";
const J = { "content-type": "application/json" };

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS ", name, detail); }
  else { fail++; console.log("FAIL ", name, detail); }
}

async function req(method, path, body, raw = false) {
  const opts = { method, headers: J };
  if (body !== undefined) opts.body = raw ? body : JSON.stringify(body);
  if (raw) delete opts.headers;
  const res = await fetch(BASE + path, opts);
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status, data };
}

const tag = Date.now().toString(36);
const clientId = `probe-${tag}`;
const nickname = `probe_${tag}`;
const password = "test123456";

// 1. 浏览公开
{
  const r = await req("GET", "/api/items?limit=1");
  check("GET /api/items 未登录可浏览", r.status === 200, `HTTP ${r.status}`);
}

// 2. 未登录发布（无 clientId）
{
  const r = await req("POST", "/api/items", {
    title: "x", category: "数码", type: "sell", price: 1,
  });
  check("POST /api/items 未登录被拦", r.status === 401 && /登录/.test(r.data?.error || ""), `HTTP ${r.status} ${r.data?.error}`);
}

// 3. 伪造 clientId 发布
{
  const r = await req("POST", "/api/items", {
    clientId: "fake-unknown-999", title: "x", category: "数码", type: "sell", price: 1,
  });
  check("POST /api/items 伪造 clientId 被拦", r.status === 401, `HTTP ${r.status} ${r.data?.error}`);
}

// 4. 注册（注册即登录）
{
  const r = await req("POST", "/api/auth/register", { clientId, nickname, password });
  check("POST /api/auth/register 成功", r.status === 200 && r.data?.clientId === clientId, `HTTP ${r.status}`);
}

// 5. 已登录发布
let itemId = null;
{
  const r = await req("POST", "/api/items", {
    clientId, title: "探针测试物品", category: "数码", type: "sell", price: 9.9,
    contactName: nickname, contactWechat: "wx123",
  });
  itemId = r.data?.id ?? null;
  check("POST /api/items 已登录发布成功", r.status === 201 && itemId != null, `HTTP ${r.status} id=${itemId}`);
}

// 6. 未登录收藏
{
  const r = await req("POST", `/api/items/${itemId}/favorite`, { clientId: "fake-unknown-999" });
  check("POST favorite 未登录被拦", r.status === 401, `HTTP ${r.status} ${r.data?.error}`);
}

// 7. 登录
{
  const r = await req("POST", "/api/auth/login", { nickname, password });
  check("POST /api/auth/login 成功", r.status === 200 && r.data?.clientId === clientId, `HTTP ${r.status}`);
}

// 8. 已登录收藏
{
  const r = await req("POST", `/api/items/${itemId}/favorite`, { clientId });
  check("POST favorite 已登录成功", r.status === 201, `HTTP ${r.status}`);
}

// 9. 未登录改状态
{
  const r = await req("PATCH", `/api/items/${itemId}`, { clientId: "fake-unknown-999", status: "sold" });
  check("PATCH item 未登录被拦", r.status === 401, `HTTP ${r.status} ${r.data?.error}`);
}

// 10. 已登录本人改状态
{
  const r = await req("PATCH", `/api/items/${itemId}`, { clientId, status: "sold" });
  check("PATCH item 已登录本人成功", r.status === 200, `HTTP ${r.status}`);
}

// 11. 未登录私信
{
  const r = await req("POST", `/api/items/${itemId}/message`, { clientId: "fake-unknown-999", body: "hi" });
  check("POST message 未登录被拦", r.status === 401, `HTTP ${r.status} ${r.data?.error}`);
}

// 12. 未登录举报
{
  const r = await req("POST", `/api/items/${itemId}/report`, { clientId: "fake-unknown-999", reason: "test" });
  check("POST report 未登录被拦", r.status === 401, `HTTP ${r.status} ${r.data?.error}`);
}

// 13. 未登录上传
{
  const fd = new FormData();
  fd.append("clientId", "fake-unknown-999");
  fd.append("file", new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }), "a.png");
  const res = await fetch(BASE + "/api/upload", { method: "POST", body: fd });
  let data = null; try { data = await res.json(); } catch {}
  check("POST upload 未登录被拦", res.status === 401, `HTTP ${res.status} ${data?.error || ""}`);
}

// 14. 未登录删除
{
  const r = await req("DELETE", `/api/items/${itemId}?clientId=fake-unknown-999`);
  check("DELETE item 未登录被拦", r.status === 401, `HTTP ${r.status} ${r.data?.error}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
