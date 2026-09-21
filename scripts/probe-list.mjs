// 列表 & 详情体验探针（CDP + 真实无头 Chrome，零依赖）
// 覆盖 v0.7.2 改动：筛选状态落 URL、结果计数条、空态区分、加载到底提示、详情页同类推荐、
//                 「擦亮」按钮归属修复、收藏接口筛选。
// 运行：先起本服务 `wrangler pages dev --port 8803 --persist-to ./.wrangler-dev-state`
//       灌数据 `node scripts/seed-cloud.mjs --emit-sql=.wrangler-dev-state/seed.sql`
//              `wrangler d1 execute idle-exchange-db --local --persist-to ./.wrangler-dev-state --file=.wrangler-dev-state/seed.sql`
//       再 `node scripts/probe-list.mjs`
// 说明：断言「加载到底提示」需要物品总数 > 30（seed-cloud 提供 34 条可见物品）。
//       Pages 会把 /x.html 规范化为 /x（clean URL），故按 pathname 判定。

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8803";
const CHROME = process.env.CHROME_PATH
  || "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe";
const PORT = Number(process.env.CDP_PORT || 9336);

if (!existsSync(CHROME)) {
  console.error("未找到 Chrome：" + CHROME + "（可用 CHROME_PATH 指定）");
  process.exit(2);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

let pass = 0, fail = 0;
function check(name, cond, detail = "") {
  if (cond) { pass++; console.log("PASS ", name, detail); }
  else { fail++; console.log("FAIL ", name, detail); }
}

const userDir = mkdtempSync(join(tmpdir(), "idle-list-"));
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
  // 等 URL 收敛（Pages 308 + 页面内跳转可能有两段）
  const goto = async (url, wait = 1000) => {
    await send("Page.navigate", { url }, sid);
    await sleep(wait);
    let last = await evalJs("location.href");
    for (let i = 0; i < 10; i++) {
      await sleep(300);
      const cur = await evalJs("location.href");
      if (cur === last) return cur;
      last = cur;
    }
    return last;
  };
  // 轮询等待条件成立（异步渲染用）
  const waitFor = async (expr, ms = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (await evalJs(expr)) return true;
      await sleep(180);
    }
    return false;
  };
  const search = () => evalJs("location.search");
  const barText = () => evalJs(`document.querySelector("#resultBar").textContent`);
  const cardCount = () => evalJs(`document.querySelectorAll("#list .card").length`);
  const setSelect = (sel, val) => evalJs(
    `(() => { const s = document.querySelector("${sel}"); s.value = ${JSON.stringify(val)};
      s.dispatchEvent(new Event("change")); return s.value; })()`
  );

  // ---- 0. 准备：清空本地身份，落到首页 ----
  await goto(BASE + "/index.html");
  await evalJs("localStorage.clear()");
  await goto(BASE + "/index.html");
  check("计数条可见", await waitFor(`!document.querySelector("#resultBar").hidden`));
  check("计数条显示件数", /共\s*\d+\s*件/.test(await barText()), await barText());
  check("首屏卡片数 = 30",
    await waitFor(`document.querySelectorAll("#list .card").length === 30`, 8000), String(await cardCount()));

  // ---- 1. 类型筛选：URL 同步 + 结果收敛 ----
  await evalJs(`document.querySelector('#typeChips .chip[data-type="free"]').click()`);
  check("类型筛选写入 URL", await waitFor(`location.search.includes("type=free")`, 7000), await search());
  check("计数条反映筛选条件",
    await waitFor(`document.querySelector("#resultBar").textContent.includes("免费送")`, 7000), await barText());
  check("列表只剩免费送", await waitFor(`(() => {
      const b = Array.from(document.querySelectorAll("#list .card .badge-float"));
      return b.length > 0 && b.every(e => e.textContent.trim() === "免费送");
    })()`, 7000));

  // ---- 2. 刷新后筛选状态保留（URL + UI 回填）----
  await send("Page.reload", {}, sid);
  check("刷新后 URL 保留筛选", await waitFor(`location.search.includes("type=free")`, 7000), await search());
  check("刷新后 chip 回填选中",
    await waitFor(`document.querySelector('#typeChips .chip[data-type="free"]').classList.contains("active")`, 8000));
  check("刷新后列表仍是筛选结果",
    await waitFor(`(() => { const b = Array.from(document.querySelectorAll("#list .card .badge-float"));
      return b.length > 0 && b.every(e => e.textContent.trim() === "免费送"); })()`, 8000));

  // ---- 3. 搜索无结果的空态（与「频道还没东西」区分）----
  await evalJs(`document.querySelector("#searchInput").value = "zzz不存在的闲置物";
    document.querySelector("#searchBtn").click()`);
  check("空态提示「没有找到符合条件的物品」",
    await waitFor(`document.querySelector("#list").textContent.includes("没有找到符合条件的物品")`, 8000));
  check("空态带「清空筛选条件」按钮", await evalJs(`!!document.querySelector("#emptyClear")`));
  await evalJs(`document.querySelector("#emptyClear").click()`);
  check("清空筛选后列表恢复",
    await waitFor(`document.querySelectorAll("#list .card").length > 0`, 8000), String(await cardCount()));
  check("清空筛选后 URL 无残留条件", !(await search()).includes("q=") && !(await search()).includes("type="),
    await search());

  // ---- 4. 分类 + 价格排序写入 URL 且排序生效 ----
  await setSelect("#categorySelect", "图书");
  check("分类筛选写入 URL",
    await waitFor(`decodeURIComponent(location.search).includes("category=图书")`, 7000), await search());
  check("计数条带分类名",
    await waitFor(`document.querySelector("#resultBar").textContent.includes("图书")`, 7000), await barText());
  await setSelect("#sortSelect", "price_desc");
  check("排序写入 URL", await waitFor(`location.search.includes("sort=price_desc")`, 7000), await search());
  // 排序是二次请求，轮询到「整页价格非递增」成立再判定，避免读到上一轮渲染
  check("价格降序排列", await waitFor(`(() => {
      const n = Array.from(document.querySelectorAll("#list .card .price"))
        .map(e => e.textContent.replace(/[^0-9.]/g, "")).filter(Boolean).map(Number);
      return n.length > 1 && n.every((v, i) => i === 0 || n[i - 1] >= v);
    })()`, 8000),
    await evalJs(`Array.from(document.querySelectorAll("#list .card .price")).map(e => e.textContent).join(",")`));

  // ---- 5. 分页：加载更多 → 到底提示（回归：limit/offset 曾被静默忽略，翻页只是重复第一页）----
  await goto(BASE + "/index.html");
  await waitFor(`/共\\s*\\d+\\s*件/.test(document.querySelector("#resultBar").textContent)`, 8000);
  const total = Number(((await barText()).match(/共\s*(\d+)\s*件/) || [])[1] || 0);
  check("计数条给出总数", total > 30, String(total));
  await waitFor(`document.querySelectorAll("#list .card").length === 30`, 8000);
  check("有更多时显示加载更多按钮",
    await evalJs(`document.querySelector("#moreWrap").style.display !== "none"`));
  await evalJs(`document.querySelector("#moreBtn").click()`);
  await waitFor(`document.querySelectorAll("#list .card").length === ${total}`, 9000);
  const pageIds = await evalJs(`Array.from(document.querySelectorAll("#list .card")).map(c => c.dataset.id)`);
  const uniq = new Set(pageIds).size;
  check("加载更多返回的是下一页（无重复卡片）", uniq === pageIds.length, `${pageIds.length} 张 / ${uniq} 唯一`);
  check("加载更多后卡片数 = 总件数", pageIds.length === total, `${pageIds.length}/${total}`);
  check("加载到底提示出现", await waitFor(`!document.querySelector("#listEnd").hidden`));
  check("到底后隐藏加载更多按钮",
    await evalJs(`document.querySelector("#moreWrap").style.display === "none"`));

  // ---- 6. 详情页同类推荐 ----
  const firstId = String(await evalJs(`document.querySelector("#list .card").dataset.id`));
  await goto(BASE + "/item.html?id=" + firstId);
  check("详情页推荐区出现", await waitFor(`!!document.querySelector(".related")`, 7000));
  const relIds = await evalJs(`Array.from(document.querySelectorAll(".related .card")).map(c => c.dataset.id)`);
  check("推荐不含当前物品", !relIds.includes(firstId), relIds.join(","));
  check("推荐数量在 1-6 之间", relIds.length >= 1 && relIds.length <= 6, String(relIds.length));

  // ---- 7. 「擦亮」按钮只对发布者出现（回归：曾对所有人显示但无事件）----
  const owned = await (await fetch(BASE + "/api/items?owner=seed-u08&limit=100")).json();
  const expired = (owned.items || []).find(i => i.title.includes("单人折叠床"));
  check("找到已过期物品用于验证", !!expired, expired ? `id=${expired.id}` : "无");

  await goto(BASE + "/index.html");
  await evalJs("localStorage.clear()");
  await goto(BASE + "/item.html?id=" + expired.id);
  await waitFor(`!!document.querySelector("#favBtn")`, 8000); // 等详情渲染完再判按钮有无
  check("匿名访客看不到「擦亮」", await evalJs(`!document.querySelector("#bumpBtn")`));
  check("匿名访客看不到「删除」", await evalJs(`!document.querySelector("#deleteBtn")`));

  await evalJs(`localStorage.setItem("idle_client_id","probe-not-owner");
    localStorage.setItem("idle_profile", JSON.stringify({nickname:"probe",accounted:true}))`);
  await send("Page.reload", {}, sid);
  await waitFor(`!!document.querySelector("#favBtn")`, 8000);
  check("非发布者登录后仍看不到「擦亮」", await evalJs(`!document.querySelector("#bumpBtn")`));
  check("非发布者看不到「标记已出」", await evalJs(`!document.querySelector("#toggleSold")`));

  await evalJs(`localStorage.setItem("idle_client_id","seed-u08");
    localStorage.setItem("idle_profile", JSON.stringify({nickname:"深大在读小陈",accounted:true}))`);
  await send("Page.reload", {}, sid);
  await waitFor(`!!document.querySelector("#favBtn")`, 8000);
  check("发布者本人能看到「擦亮」", await waitFor(`!!document.querySelector("#bumpBtn")`));
  check("发布者能看到「删除」", await evalJs(`!!document.querySelector("#deleteBtn")`));

  // ---- 8. 收藏接口支持筛选（HTTP 层）----
  const favAll = await (await fetch(BASE + "/api/favorites?clientId=seed-u08&limit=100")).json();
  const favBook = await (await fetch(BASE + "/api/favorites?clientId=seed-u08&limit=100&category=" + encodeURIComponent("图书"))).json();
  const favNone = await (await fetch(BASE + "/api/favorites?clientId=seed-u08&limit=100&q=zzz")).json();
  check("收藏总数 > 0", favAll.total > 0, String(favAll.total));
  check("收藏支持分类筛选（数量收敛）",
    favBook.total > 0 && favBook.total < favAll.total, `${favBook.total}/${favAll.total}`);
  check("收藏支持关键词筛选（无结果）", favNone.total === 0, String(favNone.total));
  check("收藏筛选返回项均为目标分类",
    (favBook.items || []).every(i => i.category === "图书"), "");
} finally {
  try { ws && ws.close(); } catch {}
  chrome.kill();
  await sleep(300);
  try { rmSync(userDir, { recursive: true, force: true }); } catch {}
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
