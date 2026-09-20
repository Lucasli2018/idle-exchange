// 本地开发数据填充（零依赖，走本地 Pages 服务的 API）
// 用途：给本地 dev D1 灌入若干测试物品，供 scripts/probe-mobile.mjs 等布局/交互探针使用。
// 运行：先起本服务 `npx wrangler pages dev --port 8803 --persist-to ./.wrangler-dev-state`
//       再 `node scripts/seed-dev.mjs`
// 说明：仅写本地 `.wrangler-dev-state` 的 D1，不影响线上；重复执行会追加新物品。

const BASE = process.env.PROBE_BASE || "http://127.0.0.1:8803";
const CLIENT = "seed-dev";
const NICK = "闲置小助手";
const COMMUNITY = "宝安福永街道办处事处";

const ITEMS = [
  { title: "九成新 Kindle Paperwhite 阅读器", category: "数码", type: "sell", price: 50 },
  { title: "宜家小书桌 自提", category: "家居", type: "sell", price: 120 },
  { title: "考研数学全套资料 免费送", category: "图书", type: "free" },
  { title: "羽绒服换冲锋衣", category: "服饰", type: "exchange" },
  { title: "求购二手婴儿推车", category: "母婴", type: "wanted" },
  { title: "折叠自行车 骑行不到 10 次", category: "运动", type: "sell", price: 380 },
  { title: "厨房小家电 空气炸锅", category: "美食", type: "sell", price: 88 },
];

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

const reg = await post("/api/auth/register", {
  clientId: CLIENT, nickname: NICK, password: "seed123456", community: COMMUNITY,
});
if (reg.status !== 200 && reg.status !== 409) {
  console.error("注册测试账号失败：", reg.status, JSON.stringify(reg.data));
  process.exit(1);
}
console.log(`测试账号就绪：${NICK}（clientId=${CLIENT}）`);

let ok = 0;
for (const it of ITEMS) {
  const r = await post("/api/items", {
    clientId: CLIENT,
    contactName: NICK,
    contactWechat: "seed_wx",
    community: COMMUNITY,
    description: "本地开发测试数据，可忽略。",
    ...it,
  });
  if (r.status === 200 || r.status === 201) ok++;
  else console.error("发布失败：", it.title, r.status, JSON.stringify(r.data));
}
const list = await (await fetch(`${BASE}/api/items?limit=1`)).json();
console.log(`已发布 ${ok}/${ITEMS.length} 条；列表当前总数：${list.total}`);
process.exit(ok === ITEMS.length ? 0 : 1);
