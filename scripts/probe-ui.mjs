// 前端交互探针（CDP + 真实无头 Chrome，零依赖）
// 用途：验证「强制登录」前端行为 —— 未登录拦截跳转、登录态放行、?redirect= 回跳、?mode= 直达。
// 运行：先起本服务 `wrangler pages dev --port 8803 --persist-to ./.wrangler-dev-state`
//       再 `node scripts/probe-ui.mjs`
// 说明：Cloudflare Pages 会把 /x.html 规范化为 /x（clean URL），故按 pathname 判定。

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8803";
const CHROME = process.env.CHROME_PATH
  || "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.CDP_PORT || 9333);

if (!existsSync(CHROME)) {
  console.error("未找到 Chrome：" + CHROME + "（可用 CHROME_PATH 指定）");
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const pathOf = h => { try { return new URL(h).pathname; } catch { return ""; } };
const queryOf = (h, k) => { try { return new URL(h).searchParams.get(k) || ""; } catch { return ""; } };

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS ", name, detail); }
  else { fail++; console.log("FAIL ", name, detail); }
}

const userDir = mkdtempSync(join(tmpdir(), "idle-probe-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  "--disable-extensions", "--disable-background-networking",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${userDir}`,
  "about:blank",
], { stdio: "ignore" });

let version = null;
for (let i = 0; i < 40 && !version; i++) {
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
    if (v.webSocketDebuggerUrl) version = v;
  } catch { /* 未就绪 */ }
  if (!version) await sleep(250);
}
if (!version) {
  console.error("Chrome CDP 未能就绪");
  chrome.kill();
  process.exit(2);
}

let ws, mid = 0;
const pend = new Map();
try {
  ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  };

  const send = (method, params = {}, sessionId) => new Promise(res => {
    const i = ++mid;
    pend.set(i, res);
    ws.send(JSON.stringify({ id: i, method, params, ...(sessionId ? { sessionId } : {}) }));
  });

  const t = await send("Target.createTarget", { url: "about:blank" });
  const targetId = t.result.targetId;
  const a = await send("Target.attachToTarget", { targetId, flatten: true });
  const sid = a.result.sessionId;
  await send("Page.enable", {}, sid);
  await send("Runtime.enable", {}, sid);

  const evalJs = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sid);
    return r.result?.result?.value;
  };
  const goto = async (url, wait = 1500) => {
    await send("Page.navigate", { url }, sid);
    await sleep(wait);
    return await evalJs("location.href");
  };

  // ---- 未登录场景 ----
  await goto(BASE + "/index.html");
  await evalJs("localStorage.clear()");
  await goto(BASE + "/index.html");

  // A0. 顶栏账号入口：未登录 → 醒目登录按钮，且无登录 CTA 横幅
  check("首页顶部存在登录注册按钮",
    await evalJs(`!!document.querySelector("#accountSlot .btn-login")`), "");
  check("登录 CTA 横幅已移除",
    await evalJs(`!document.querySelector("#ctaBanner")`), "");

  // A. 未登录访问发布页 → 跳登录（带回跳）
  let href = await goto(BASE + "/post.html");
  check("未登录访问 /post 跳登录页", pathOf(href) === "/auth", href);
  check("登录页回跳参数指向 /post.html", queryOf(href, "redirect") === "/post.html", href);

  // B. 未登录访问消息页 → 跳登录
  href = await goto(BASE + "/messages.html");
  check("未登录访问 /messages 跳登录页", pathOf(href) === "/auth", href);
  check("登录页回跳参数指向 /messages.html", queryOf(href, "redirect") === "/messages.html", href);

  // C. 未登录点首页「我的」→ 跳登录（回跳带 mode=mine）
  await goto(BASE + "/index.html");
  await evalJs(`document.querySelector("#mineBtn").click()`);
  await sleep(700);
  href = await evalJs("location.href");
  check("未登录点「我的」跳登录", pathOf(href) === "/auth", href);
  check("「我的」回跳带 mode=mine", queryOf(href, "redirect").includes("mode=mine"), href);

  // D. 未登录点首页「收藏」→ 跳登录（回跳带 mode=fav）
  await goto(BASE + "/index.html");
  await evalJs(`document.querySelector("#favBtn").click()`);
  await sleep(700);
  href = await evalJs("location.href");
  check("未登录点「收藏」跳登录", pathOf(href) === "/auth", href);
  check("「收藏」回跳带 mode=fav", queryOf(href, "redirect").includes("mode=fav"), href);

  // E. 未登录浏览详情页 → 不跳转（浏览公开）
  await goto(BASE + "/index.html");
  await evalJs("localStorage.clear()");
  href = await goto(BASE + "/item.html?id=1");
  check("未登录可浏览详情页（不跳转）", pathOf(href) === "/item", href);

  // ---- 登录态场景（注入本地登录标记，等价于已登录）----
  await goto(BASE + "/index.html");
  await evalJs(`localStorage.setItem("idle_client_id","probe-ui");
    localStorage.setItem("idle_profile", JSON.stringify({nickname:"tester",accounted:true}));`);

  // F. 已登录可进入发布页
  href = await goto(BASE + "/post.html");
  check("已登录可进入 /post", pathOf(href) === "/post", href);
  check("已登录发布表单存在", await evalJs(`!!document.querySelector("#postForm")`), "");

  // G. 已登录 ?mode=mine 直达「我的」
  await goto(BASE + "/index.html?mode=mine");
  check("已登录 ?mode=mine 进入我的视图",
    await evalJs(`document.querySelector("#mineBtn").classList.contains("active")`), "");

  // H. 已登录可进入消息页
  href = await goto(BASE + "/messages.html");
  check("已登录可进入 /messages", pathOf(href) === "/messages", href);

  // I. 已登录时顶栏切换为「昵称 + 退出」
  await goto(BASE + "/index.html");
  check("已登录首页隐藏登录按钮",
    await evalJs(`!document.querySelector("#accountSlot .btn-login")`), "");
  check("已登录首页显示昵称 + 退出",
    await evalJs(`!!document.querySelector("#accountSlot .user-chip") && !!document.querySelector("#accountSlot .btn-logout")`), "");
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  await sleep(300);
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
