// 手机端布局探针（CDP + 真实无头 Chrome，零依赖）
// 用途：验证顶栏账号入口位置/尺寸、登录 CTA 横幅已移除、窄屏无横向溢出、卡片列数正确。
// 运行：先起本服务 `npx wrangler pages dev --port 8803 --persist-to ./.wrangler-dev-state`
//       灌数据 `node scripts/seed-dev.mjs`（列表卡片列数断言需 ≥3 条物品）
//       再 `node scripts/probe-mobile.mjs`（截图输出到 ./.probe-shots/）
// 说明：CDP 下必须 mobile:false（mobile:true 会缩放布局视口），窗口宽度用 Emulation 覆盖。

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8803";
const CHROME = process.env.CHROME_PATH
  || "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.CDP_PORT || 9334);
const SHOT_DIR = process.env.SHOT_DIR || ".probe-shots";

if (!existsSync(CHROME)) {
  console.error("未找到 Chrome：" + CHROME + "（可用 CHROME_PATH 指定）");
  process.exit(2);
}
mkdirSync(SHOT_DIR, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS ", name, detail); }
  else { fail++; console.log("FAIL ", name, detail); }
}

const userDir = mkdtempSync(join(tmpdir(), "idle-mobile-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--no-first-run",
  "--disable-extensions", "--disable-background-networking",
  "--hide-scrollbars",
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
  const sid = (await send("Target.attachToTarget", { targetId: t.result.targetId, flatten: true }))
    .result.sessionId;
  await send("Page.enable", {}, sid);
  await send("Runtime.enable", {}, sid);

  const evalJs = async expr => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true }, sid);
    if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  };
  const goto = async (url, wait = 1600) => {
    await send("Page.navigate", { url }, sid);
    await sleep(wait);
  };
  const setViewport = async (w, h) => {
    await send("Emulation.setDeviceMetricsOverride", {
      width: w, height: h, deviceScaleFactor: 2, mobile: false,
    }, sid);
    await sleep(200);
  };
  const shot = async (name, h) => {
    const r = await send("Page.captureScreenshot", {
      format: "png", captureBeyondViewport: true,
    }, sid);
    writeFileSync(join(SHOT_DIR, name + ".png"), Buffer.from(r.result.data, "base64"));
  };

  // ============ 375px（iPhone 常规宽度）============
  await setViewport(375, 812);
  await goto(BASE + "/index.html");
  await evalJs("localStorage.clear(); localStorage.setItem('idle_client_id','probe-mobile');");
  await goto(BASE + "/index.html");

  const probe375 = await evalJs(`(() => {
    const q = s => document.querySelector(s);
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top),
               b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
    const login = q("#accountSlot .btn-login");
    const slot = q("#accountSlot");
    const nav = q(".topbar .actions");
    const cards = [...document.querySelectorAll("#list .card")].map(r);
    const sel = [...document.querySelectorAll(".row2 select")].map(e => ({ id: e.id, ...r(e) }));
    return {
      vw: innerWidth,
      scrollW: document.documentElement.scrollWidth,
      bodyScrollW: document.body.scrollWidth,
      banner: !!q("#ctaBanner"),
      login: r(login),
      loginHref: login ? login.getAttribute("href") : null,
      slot: r(slot),
      nav: r(nav),
      navBtns: [...document.querySelectorAll(".topbar .actions .btn")].map(r),
      cards,
      sel,
      searchInput: r(q("#searchInput")),
      searchBtn: r(q("#searchBtn")),
      chipOverflow: (() => { const c = q(".chips"); return c ? c.scrollWidth <= c.clientWidth + 2 : null; })(),
    };
  })()`);

  check("375 无横向溢出", probe375.scrollW <= probe375.vw + 1,
    `scrollWidth=${probe375.scrollW} vw=${probe375.vw}`);
  check("登录 CTA 横幅已移除", probe375.banner === false, "");
  check("未登录时显示登录 / 注册按钮", !!probe375.login, "");
  check("登录按钮指向 /auth.html", probe375.loginHref === "/auth.html", String(probe375.loginHref));
  check("登录按钮足够大（高 ≥ 34px）", !!probe375.login && probe375.login.h >= 34,
    probe375.login ? `h=${probe375.login.h}` : "无按钮");
  check("登录按钮足够大（宽 ≥ 96px）", !!probe375.login && probe375.login.w >= 96,
    probe375.login ? `w=${probe375.login.w}` : "无按钮");
  check("登录按钮位于右侧（左边缘 > 视口一半）",
    !!probe375.login && probe375.login.l > probe375.vw / 2,
    probe375.login ? `left=${probe375.login.l} vw=${probe375.vw}` : "无按钮");
  check("登录按钮贴右边距（≤ 20px）",
    !!probe375.login && probe375.vw - probe375.login.r <= 20,
    probe375.login ? `rightGap=${probe375.vw - probe375.login.r}` : "无按钮");
  check("手机端顶栏两行：导航在登录按钮下方",
    !!(probe375.nav && probe375.login) && probe375.nav.t >= probe375.login.b - 2,
    probe375.nav && probe375.login ? `navTop=${probe375.nav.t} loginBottom=${probe375.login.b}` : "");
  check("导航四个按钮无溢出",
    probe375.navBtns.length === 4 && probe375.navBtns.every(b => b.r <= probe375.vw + 1),
    JSON.stringify(probe375.navBtns.map(b => b.r)));
  check("卡片两列（第 1、2 张同排）",
    probe375.cards.length >= 2 && probe375.cards[0].t === probe375.cards[1].t,
    JSON.stringify(probe375.cards.slice(0, 2).map(c => c.t)));
  check("卡片两列（第 3 张换行）",
    probe375.cards.length >= 3 && probe375.cards[2].t > probe375.cards[0].t,
    probe375.cards.length >= 3 ? `t0=${probe375.cards[0].t} t2=${probe375.cards[2].t}` : "卡片不足 3 张");
  check("卡片不超出视口",
    probe375.cards.every(c => c.r <= probe375.vw + 1 && c.l >= -1),
    JSON.stringify(probe375.cards.slice(0, 2).map(c => [c.l, c.r])));
  check("筛选下拉三件套不溢出",
    probe375.sel.length === 3 && probe375.sel.every(s => s.r <= probe375.vw + 1),
    JSON.stringify(probe375.sel.map(s => [s.id, s.r])));
  check("排序下拉独占一行", probe375.sel.length === 3 && probe375.sel[2].t > probe375.sel[0].t,
    probe375.sel.length === 3 ? `t0=${probe375.sel[0].t} t2=${probe375.sel[2].t}` : "");
  check("搜索按钮高度 ≥ 40px（触控友好）", probe375.searchBtn.h >= 40, `h=${probe375.searchBtn.h}`);
  check("搜索框不被按钮挤没（宽 ≥ 150px）", probe375.searchInput.w >= 150, `w=${probe375.searchInput.w}`);
  await shot("home-375");

  // 登录态：昵称 + 退出
  await evalJs(`localStorage.setItem("idle_profile", JSON.stringify({nickname:"一个很长的昵称测试",accounted:true}));`);
  await goto(BASE + "/index.html");
  const loggedIn = await evalJs(`(() => {
    const q = s => document.querySelector(s);
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top),
               b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      hasLogin: !!q(".btn-login"),
      chip: r(q(".user-chip")), logout: r(q(".btn-logout")),
      vw: innerWidth, scrollW: document.documentElement.scrollWidth,
      chat: !!q("#ctaBanner"),
    };
  })()`);
  check("已登录不再显示登录按钮", loggedIn.hasLogin === false, "");
  check("已登录显示昵称胶囊 + 退出按钮", !!(loggedIn.chip && loggedIn.logout), "");
  check("已登录顶栏无横向溢出", loggedIn.scrollW <= loggedIn.vw + 1,
    `scrollWidth=${loggedIn.scrollW}`);
  check("昵称过长被截断（宽 ≤ 视口 34%）",
    !!loggedIn.chip && loggedIn.chip.w <= loggedIn.vw * 0.36 + 2, `w=${loggedIn.chip?.w}`);
  await shot("home-375-loggedin");

  // ============ 320px（最小屏）============
  await setViewport(320, 640);
  await goto(BASE + "/index.html");
  await evalJs("localStorage.clear(); localStorage.setItem('idle_client_id','probe-mobile');");
  await goto(BASE + "/index.html");
  const p320 = await evalJs(`(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }; };
    return {
      vw: innerWidth, scrollW: document.documentElement.scrollWidth,
      login: r(document.querySelector("#accountSlot .btn-login")),
      navBtns: [...document.querySelectorAll(".topbar .actions .btn")].map(r),
      cards: [...document.querySelectorAll("#list .card")].map(r),
      sel: [...document.querySelectorAll(".row2 select")].map(r),
    };
  })()`);
  check("320 无横向溢出", p320.scrollW <= p320.vw + 1,
    `scrollWidth=${p320.scrollW} vw=${p320.vw}`);
  check("320 登录按钮仍可见", !!p320.login && p320.login.w >= 80,
    p320.login ? `w=${p320.login.w}` : "无按钮");
  check("320 导航按钮无溢出", p320.navBtns.every(b => b.r <= p320.vw + 1),
    JSON.stringify(p320.navBtns.map(b => b.r)));
  check("320 卡片不溢出", p320.cards.every(c => c.r <= p320.vw + 1), "");
  await shot("home-320");

  // ============ 详情页 / 表单页 / 登录页（375px）============
  await setViewport(375, 812);
  const firstId = await (await fetch(BASE + "/api/items?limit=1"))
    .json().then(d => (d.items && d.items[0] && d.items[0].id) || 1).catch(() => 1);
  await goto(BASE + `/item.html?id=${firstId}`);
  const detail = await evalJs(`(() => ({
    vw: innerWidth, scrollW: document.documentElement.scrollWidth,
    galleryH: (() => { const g = document.querySelector(".gallery img, .gallery .ph");
      return g ? Math.round(g.getBoundingClientRect().height) : null; })(),
    actions: [...document.querySelectorAll(".action-bar .btn")].map(b => {
      const r = b.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right) }; }),
  }))()`);
  check("详情页无横向溢出", detail.scrollW <= detail.vw + 1,
    `scrollWidth=${detail.scrollW}`);
  check("详情页图片高度收敛（≤ 210px）", detail.galleryH === null || detail.galleryH <= 210,
    `h=${detail.galleryH}`);
  check("详情页动作按钮不溢出", detail.actions.every(b => b.r <= detail.vw + 1), "");
  await shot("detail-375");

  await goto(BASE + "/auth.html");
  const auth = await evalJs(`(() => ({
    vw: innerWidth, scrollW: document.documentElement.scrollWidth,
    cardW: Math.round(document.querySelector(".auth-card").getBoundingClientRect().width),
    tabH: Math.round(document.querySelector(".auth-tab").getBoundingClientRect().height),
  }))()`);
  check("登录页无横向溢出", auth.scrollW <= auth.vw + 1, `scrollWidth=${auth.scrollW}`);
  check("登录页卡片铺满可用宽度（≥ 320px）", auth.cardW >= 320, `w=${auth.cardW}`);
  check("登录页分段标签触控高度 ≥ 40px", auth.tabH >= 40, `h=${auth.tabH}`);
  await shot("auth-375");

  await goto(BASE + "/post.html");
  await evalJs(`localStorage.setItem("idle_profile", JSON.stringify({nickname:"tester",accounted:true}));`);
  await goto(BASE + "/post.html");
  const post = await evalJs(`(() => ({
    vw: innerWidth, scrollW: document.documentElement.scrollWidth,
    slot: Math.round(document.querySelector(".uploader .slot").getBoundingClientRect().width),
    inputFont: getComputedStyle(document.querySelector("#title")).fontSize,
  }))()`);
  check("发布页无横向溢出", post.scrollW <= post.vw + 1, `scrollWidth=${post.scrollW}`);
  check("发布页输入框字号 16px（防 iOS 聚焦缩放）", post.inputFont === "16px", post.inputFont);
  await shot("post-375");

  // ============ 768px（平板，顶栏应回到单行）============
  await setViewport(768, 1024);
  await evalJs("localStorage.clear()");
  await goto(BASE + "/index.html");
  const p768 = await evalJs(`(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
    return {
      vw: innerWidth, scrollW: document.documentElement.scrollWidth,
      login: r(document.querySelector("#accountSlot .btn-login")),
      nav: r(document.querySelector(".topbar .actions")),
    };
  })()`);
  check("768 顶栏单行（导航与登录按钮同一行）",
    Math.abs(p768.nav.t - p768.login.t) <= 8,
    `navTop=${p768.nav.t} loginTop=${p768.login.t}`);
  check("768 登录按钮仍在最右侧",
    p768.login.r >= p768.nav.r, `loginRight=${p768.login.r} navRight=${p768.nav.r}`);
  check("768 无横向溢出", p768.scrollW <= p768.vw + 1, "");
  await shot("home-768");

  // ============ 1285px（桌面，对照原始问题截图）============
  await setViewport(1285, 800);
  await goto(BASE + "/index.html");
  const p1285 = await evalJs(`(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top),
               b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
    const btns = [...document.querySelectorAll(".topbar .actions .btn")];
    return {
      vw: innerWidth, scrollW: document.documentElement.scrollWidth,
      login: r(document.querySelector("#accountSlot .btn-login")),
      nav: r(document.querySelector(".topbar .actions")),
      navRight: btns.length ? Math.round(btns[btns.length - 1].getBoundingClientRect().right) : null,
    };
  })()`);
  check("1285 顶栏单行且导航与登录按钮同一行",
    Math.abs(p1285.nav.t - p1285.login.t) <= 8,
    `navTop=${p1285.nav.t} loginTop=${p1285.login.t}`);
  check("1285 登录按钮在顶栏最右侧（右于「发布」）",
    p1285.login.r > p1285.navRight, `loginRight=${p1285.login.r} postRight=${p1285.navRight}`);
  check("1285 登录按钮为放大样式（宽 ≥ 110px 且高 ≥ 38px）",
    p1285.login.w >= 110 && p1285.login.h >= 38, `w=${p1285.login.w} h=${p1285.login.h}`);
  check("1285 无横向溢出", p1285.scrollW <= p1285.vw + 1, "");
  await shot("home-1285");
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  await sleep(300);
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败（截图：${SHOT_DIR}/）`);
process.exit(fail ? 1 : 0);
