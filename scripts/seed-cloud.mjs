// 线上 D1 测试数据生成（零依赖，走 D1 REST API）
//
// 用途：给 idle-exchange 灌一批"像真的"的社区闲置数据，用于演示 / 联调 / 后台验证。
//      含 12 个可登录账号、8 个圈子、45 件物品（覆盖 8 分类 × 4 类型）、图片、
//      收藏、私信会话（含未读）、举报（供管理后台处理）。
//
// 运行：
//   node scripts/seed-cloud.mjs              # 先清理旧的 seed 数据，再重新灌（幂等）
//   node scripts/seed-cloud.mjs --clean      # 只清理 seed-* 数据，不灌
//   node scripts/seed-cloud.mjs --no-ph      # 不生成 public/ph 占位图
//   node scripts/seed-cloud.mjs --dry        # 只打印将要执行的统计，不写库
//
// Token：环境变量 CLOUDFLARE_API_TOKEN，或 ~/.cf_d1_token 文件（需 D1 Edit 权限）
// 说明：所有测试账号 client_id 以 seed- 前缀，可安全清理，不影响真实用户。
//      物品图片指向站内静态占位图 /ph/<slug>.svg，不占用 R2。

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { pbkdf2Sync } from "node:crypto";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const FLAG = name => argv.includes("--" + name);

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "332b848d9f5d9ec2808bdb855763eb8e";
const TOML = readFileSync(join(ROOT, "wrangler.toml"), "utf8");
const DB_ID = (TOML.match(/database_id\s*=\s*"([^"]+)"/) || [])[1];
if (!DB_ID) { console.error("未能从 wrangler.toml 解析 database_id"); process.exit(1); }

function readToken() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN.trim();
  const f = join(homedir(), ".cf_d1_token");
  if (existsSync(f)) return readFileSync(f, "utf8").trim();
  console.error("缺少 CLOUDFLARE_API_TOKEN（或 ~/.cf_d1_token）");
  process.exit(1);
}
const TOKEN = readToken();

const DAY = 86400000;
const NOW = Date.now();
const PASSWORD = "idle123456";

// ============ 确定性伪随机（保证每次灌出的数据一致）============
function makeRng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = makeRng(20260921);

// ============ 数据定义 ============
const CIRCLES = [
  "深圳南山·科技园", "深圳南山·海岸城", "深圳福田·车公庙", "深圳宝安·西乡街道",
  "深圳龙岗·坂田万科城", "深圳龙华·壹方天地", "广州天河·珠江新城", "东莞松山湖·华为溪流背坡村",
];

const USERS = [
  { id: "seed-u01", nick: "南山老李", c: CIRCLES[0] },
  { id: "seed-u02", nick: "科技园小王", c: CIRCLES[0] },
  { id: "seed-u03", nick: "福田芳姐", c: CIRCLES[2] },
  { id: "seed-u04", nick: "坂田小周", c: CIRCLES[4] },
  { id: "seed-u05", nick: "西乡宝妈婷婷", c: CIRCLES[3] },
  { id: "seed-u06", nick: "珠江新城阿May", c: CIRCLES[6] },
  { id: "seed-u07", nick: "松山湖老K", c: CIRCLES[7] },
  { id: "seed-u08", nick: "深大在读小陈", c: CIRCLES[1] },
  { id: "seed-u09", nick: "海岸城Jessie", c: CIRCLES[1] },
  { id: "seed-u10", nick: "车公庙老张", c: CIRCLES[2] },
  { id: "seed-u11", nick: "龙华跑者阿凯", c: CIRCLES[5] },
  { id: "seed-u12", nick: "宝安咖啡师Nina", c: CIRCLES[3] },
];
// 简号（u01）与完整 client_id（seed-u01）双向索引，便于数据定义处简写
const U = {};
USERS.forEach(u => { U[u.id] = u; U[u.id.replace("seed-", "")] = u; });
const cid = s => U[s].id;

const CAT_SLUG = { 数码: "digital", 家居: "home", 图书: "book", 服饰: "cloth", 母婴: "baby", 运动: "sport", 美食: "food", 其他: "other" };

// 物品：o=发布者(简号) t=标题 c=分类 k=类型 p=价格 ph=图片张数 d=描述 age=发布天数前 st=状态
const ITEMS = [
  // ---- 数码 ----
  { o: "u01", t: "九成新 iPad Air 4 64G 深空灰", c: "数码", k: "sell", p: 1580, ph: 2, age: 2,
    d: "去年双十一买的，屏幕贴膜无划痕，一直带壳用，电池健康 91%。原装充电头 + 数据线都在。科技园地铁站自提，或送到楼下也行。" },
  { o: "u07", t: "MacBook Pro 14 M1 Pro 16G+512G", c: "数码", k: "sell", p: 7800, ph: 2, age: 5,
    d: "公司发的机器自用一年多，电池循环 120 次，外观完好无磕碰。因换新出掉，可当面验机跑分，松山湖附近面交。" },
  { o: "u08", t: "罗技 MX Master 3S 无线鼠标", c: "数码", k: "sell", p: 320, ph: 1, age: 8,
    d: "用了一个学期，功能正常，滚轮手感依旧很顶。考研上岸了用不上，便宜出。带原装接收器。" },
  { o: "u02", t: "索尼 WH-1000XM4 头戴降噪耳机", c: "数码", k: "sell", p: 780, ph: 2, age: 12, st: "sold",
    d: "通勤用了两年，降噪依旧很能打。耳罩有一点点磨损（见图），耳罩已换新过一次。已出，谢谢大家。" },
  { o: "u09", t: "显示器支架 单屏 气压式", c: "数码", k: "sell", p: 90, ph: 1, age: 6,
    d: "搬家多出来的，桌面空间救星。支持 17-32 寸，承重够，配件齐全。海岸城附近自提。" },
  { o: "u11", t: "求购 Apple Watch S8 / S9 45mm", c: "数码", k: "wanted", ph: 0, age: 3,
    d: "跑步想换块表，要求 45mm 运动款，电池健康 90% 以上，无拆无修。价格好谈，龙华附近优先。" },
  { o: "u03", t: "旧款机械键盘 黑轴 免费送", c: "数码", k: "free", ph: 1, age: 18,
    d: "键帽有掉漆，轴体完好，插上就能用。不想扔垃圾桶，有需要的自提，车公庙地铁站附近。" },

  // ---- 家居 ----
  { o: "u05", t: "宜家 MALM 双人床架 1.5m", c: "家居", k: "sell", p: 350, ph: 2, age: 15,
    d: "搬新家换了床，这个闲置了。板材完整，螺丝配件都在，需要自己拆装。西乡自提，有电梯。" },
  { o: "u04", t: "实木餐桌 + 4 把椅子", c: "家居", k: "sell", p: 600, ph: 2, age: 22,
    d: "1.2m 橡木色餐桌，用了两年，桌面有轻微使用痕迹不影响使用。四把椅子一起出，不单卖。坂田万科城自提。" },
  { o: "u06", t: "戴森 V8 无绳吸尘器", c: "家居", k: "sell", p: 850, ph: 1, age: 9,
    d: "全套配件齐全，电池刚换新，续航正常。因为家里换了扫地机器人闲着。珠江新城自提。" },
  { o: "u10", t: "米家空气净化器 4 Lite", c: "家居", k: "sell", p: 260, ph: 1, age: 30,
    d: "滤芯上个月刚换，机器运行安静。适合小卧室或书房，原箱包装还在。" },
  { o: "u01", t: "鹿客智能门锁 C 级锁芯", c: "家居", k: "sell", p: 380, ph: 1, age: 11,
    d: "指纹/密码/钥匙三合一，换房拆下来的，功能一切正常，含安装说明。科技园自提。" },
  { o: "u12", t: "宜家小推车 三层 免费送", c: "家居", k: "free", ph: 1, age: 26,
    d: "白色三层推车，轮子顺滑，放厨房或卫生间都好用。有点旧但结实，西乡自提。" },

  // ---- 图书 ----
  { o: "u08", t: "考研数学一 全套资料 免费送", c: "图书", k: "free", ph: 2, age: 4,
    d: "张宇 36 讲 + 李永乐全套 + 历年真题，有大量笔记和标注，可能有点乱但不缺页。刚上岸，送给需要的学弟学妹。" },
  { o: "u08", t: "《深入理解计算机系统》第三版", c: "图书", k: "sell", p: 45, ph: 1, age: 20,
    d: "正版，书脊完好，内页干净几乎没写划。计算机专业必读，低价出。" },
  { o: "u05", t: "儿童绘本 约 30 本", c: "图书", k: "free", ph: 2, age: 28,
    d: "3-6 岁绘本，孩子大了用不上。有几本有涂画痕迹，介意勿拍。整批送，不单本挑。" },
  { o: "u02", t: "《算法导论》中文第三版", c: "图书", k: "sell", p: 60, ph: 1, age: 7,
    d: "机械工业出版社正版，九成新。当年啃了一半，工作后没时间看了。" },
  { o: "u07", t: "技术书打包 5 本（CSAPP/DDIA/重构等）", c: "图书", k: "sell", p: 150, ph: 2, age: 38,
    d: "都是好书，打包价不单卖：《CSAPP》《数据密集型应用系统设计》《重构》《代码整洁之道》《Effective Java》。松山湖自提，快递也行。" },
  { o: "u11", t: "求购 小学二年级 语文数学教辅", c: "图书", k: "wanted", ph: 0, age: 13,
    d: "亲戚家小孩转学过来，想收一套二年级的教辅和练习册，版本不限，用完能看就行。" },

  // ---- 服饰 ----
  { o: "u09", t: "优衣库轻型羽绒服 女 M 码", c: "服饰", k: "sell", p: 120, ph: 2, age: 16,
    d: "去年冬天买的，穿了不到十次，无污渍无破损。颜色是米白，百搭。可以试穿，不合适当场说不。" },
  { o: "u05", t: "巴布豆童鞋 26 码 两双", c: "服饰", k: "sell", p: 60, ph: 1, age: 21,
    d: "孩子脚长得快，两双一起 60。一双运动款一双凉鞋，洗过晒过，鞋底磨损很轻。" },
  { o: "u12", t: "Nike Air Force 1 白色 42 码", c: "服饰", k: "sell", p: 220, ph: 2, age: 10,
    d: "正品专柜入，穿了大概十次，鞋底有轻微氧化（见图），鞋型完好。原鞋盒在。" },
  { o: "u11", t: "The North Face 冲锋衣 男 L 码", c: "服饰", k: "sell", p: 480, ph: 1, age: 24,
    d: "三层冲锋衣，防水透气，去年爬山买的，穿过三回。袖口无磨损，拉链顺滑。" },
  { o: "u03", t: "羊绒大衣 L 码 换通勤风衣", c: "服饰", k: "exchange", ph: 2, age: 19,
    d: "深灰色羊绒大衣，版型好但买大了。想换一件通勤风衣（男 L 或女 XL 都可以），价格相近即可。" },

  // ---- 母婴 ----
  { o: "u05", t: "好孩子婴儿推车 轻便款", c: "母婴", k: "sell", p: 280, ph: 2, age: 14, st: "sold",
    d: "可折叠上飞机，遮阳篷完整，轮子做过清洁。孩子大了坐不下，已出给同小区的宝妈。" },
  { o: "u05", t: "婴儿衣服 0-6 个月 一批", c: "母婴", k: "free", ph: 2, age: 33,
    d: "连体衣、包屁衣、小袜子一共二十来件，都洗过消毒过，有几件稍微发黄。免费送给有需要的准妈妈。" },
  { o: "u06", t: "美德乐电动吸奶器 单边", c: "母婴", k: "sell", p: 350, ph: 1, age: 17,
    d: "正品单边款，所有接触配件已换新，机身功能正常。原包装和说明书齐全。" },
  { o: "u10", t: "儿童安全座椅 0-4 岁", c: "母婴", k: "sell", p: 260, ph: 2, age: 29,
    d: "ISOFIX 接口，安装方便，布套已拆洗。孩子换大座椅了，出给需要的家庭。" },
  { o: "u04", t: "求购 实木婴儿床 带床垫", c: "母婴", k: "wanted", ph: 0, age: 6,
    d: "朋友家马上添丁，想收一张实木婴儿床，最好带床垫和蚊帐，无异味无掉漆。价格面议。" },

  // ---- 运动 ----
  { o: "u11", t: "捷安特 ATX 山地车 27.5 寸", c: "运动", k: "sell", p: 680, ph: 2, age: 8,
    d: "骑了两年，最近刚做保养（换了刹车皮和链条）。车架无裂无补，适合通勤和周末骑行。" },
  { o: "u04", t: "迪卡侬 折叠跑步机", c: "运动", k: "sell", p: 420, ph: 1, age: 23,
    d: "买来跑了三个月就吃灰了，最高速度 10km/h，可折叠收纳。自提优先，太重不好寄。" },
  { o: "u12", t: "瑜伽垫 + 哑铃 5kg×2", c: "运动", k: "sell", p: 80, ph: 1, age: 12,
    d: "垫子厚 8mm，用过但很干净；哑铃是包胶的，练肩背足够。一起出，可以单要。" },
  { o: "u02", t: "尤尼克斯 NF800 羽毛球拍 一对", c: "运动", k: "sell", p: 560, ph: 2, age: 25,
    d: "一把 4U 一把 3U，都拉好线（26 磅），手胶换过。打了半年，拍框无磕碰。" },
  { o: "u08", t: "求购 二手公路车 54 码 预算 2000", c: "运动", k: "wanted", ph: 0, age: 9,
    d: "想入坑公路车，预算 2000 左右，54 码车架，成色只要不影响骑行就行，变速正常即可。" },

  // ---- 美食 ----
  { o: "u12", t: "德龙 EC685 半自动咖啡机", c: "美食", k: "sell", p: 450, ph: 2, age: 65,
    d: "在家自己拉花用了一段时间，后来店里升级设备就闲置了。蒸汽棒正常，配件齐全。" },
  { o: "u03", t: "空气炸锅 4.5L 九成新", c: "美食", k: "sell", p: 88, ph: 1, age: 13, st: "sold",
    d: "买重了所以出，用过三四次，内胆无划痕。已出。" },
  { o: "u06", t: "摩飞多功能锅 标配", c: "美食", k: "sell", p: 180, ph: 1, age: 33,
    d: "煮火锅、煎烤都行，盘面有不粘涂层，清洗方便。用得不多，配件齐全。" },
  { o: "u09", t: "闲置餐具套装 碗盘各 4", c: "美食", k: "free", ph: 1, age: 27,
    d: "搬家买了新的，这套白瓷的免费送。全部完好，洗碗机洗过，海岸城自提。" },
  { o: "u10", t: "求购 二手面包机", c: "美食", k: "wanted", ph: 0, age: 5,
    d: "想试试自己做面包，收一台功能正常的面包机，牌子不限，能出就行。" },

  // ---- 其他 ----
  { o: "u01", t: "折叠储物箱 3 个", c: "其他", k: "sell", p: 30, ph: 1, age: 40,
    d: "牛津布材质，可折叠，容量大概 60L。搬家前清出来的，三个一起 30，自提。" },
  { o: "u07", t: "戴森吹风机 原装风嘴配件", c: "其他", k: "sell", p: 120, ph: 1, age: 31,
    d: "朋友送的套装里多出来的风嘴，未拆封。型号是 Supersonic 通用款，两件一起出。" },
  { o: "u03", t: "实木猫爬架 大号", c: "其他", k: "sell", p: 150, ph: 2, age: 20,
    d: "高 1.4m，带磨爪柱和窝。家里两只猫都胖了爬不动，擦干净了，自提。" },
  { o: "u08", t: "单人折叠床 午休用", c: "其他", k: "sell", p: 120, ph: 1, age: 52,
    d: "办公室午休神器，三折款，收起来不占地方。毕业了带不走，低价出。" },
  { o: "u04", t: "搬家清仓 一箱杂物 免费送", c: "其他", k: "free", ph: 2, age: 3,
    d: "箱子里有挂钩、收纳盒、没拆封的数据线、半瓶洗衣液等等，都还能用。整箱自提，先到先得。" },
  { o: "u09", t: "露营装备（天幕+折叠桌）换投影仪", c: "其他", k: "exchange", ph: 2, age: 7,
    d: "天幕 3×3 米、铝合金折叠桌一张，都只用过两次。想换一台能连 HDMI 的便携投影仪，差价好商量。" },
  { o: "u10", t: "一次性打火机 整盒 50 个", c: "其他", k: "sell", p: 25, ph: 1, age: 16, st: "removed",
    d: "仓库清出来的整盒打火机。", admin: "违禁品，已下架" },
];

// 私信：基于物品序号（1-based）
const THREADS = [
  { item: 1, buyer: "u08", msgs: [
    ["u08", "你好，iPad 还在吗？"],
    ["u01", "在的，成色很好，电池健康 91%"],
    ["u08", "能便宜点吗？1450 我明天自提"],
    ["u01", "1500 吧，送一个原装保护壳"],
    ["u08", "行，明天下班后科技园地铁站见"],
  ] },
  { item: 2, buyer: "u02", msgs: [
    ["u02", "MacBook 还在么，能验机吗"],
    ["u07", "在，随时可以，我周末在家"],
    ["u02", "电池循环大概多少？"],
    ["u07", "120 次左右，我拍了截图，加微信发你"],
  ] },
  { item: 8, buyer: "u04", msgs: [
    ["u04", "床架拆下来了吗？我自己拆也行"],
    ["u05", "还没拆，你要的话我提前拆好"],
    ["u04", "谢谢！周末过来拉，需要带工具吗"],
  ] },
  { item: 9, buyer: "u05", msgs: [
    ["u05", "餐桌 600 能单要桌子吗"],
    ["u04", "椅子留着没用，一起拿走吧，600 已经很低了"],
    ["u05", "好的那我全要了"],
  ] },
  { item: 10, buyer: "u09", msgs: [
    ["u09", "戴森还在吗？配件齐不齐"],
    ["u06", "在的，地刷、缝隙刷、床褥吸头都有"],
    ["u09", "电池是新换的吗"],
    ["u06", "上个月刚换的原厂电池，续航满血"],
    ["u09", "那我要了，周末过去拿"],
  ] },
  { item: 14, buyer: "u02", msgs: [
    ["u02", "资料还在吗？我今年也考数一"],
    ["u08", "在的，有挺多笔记，不嫌弃就来拿"],
    ["u02", "完全不嫌弃！谢谢学长，我可以来海岸城"],
  ] },
  { item: 25, buyer: "u06", msgs: [
    ["u06", "推车还在吗，折叠后能上飞机不"],
    ["u05", "可以上，尺寸符合要求"],
    ["u06", "那我周末过来看看，合适就带走"],
    ["u05", "好的，已经给你留着了"],
  ] },
  { item: 30, buyer: "u04", msgs: [
    ["u04", "车还在吗？能骑过来看看不"],
    ["u11", "在，车况挺好，刚换过刹车皮"],
    ["u04", "680 能到 620 吗"],
    ["u11", "650 最低了，保养花了一百多"],
  ] },
  { item: 35, buyer: "u03", msgs: [
    ["u03", "咖啡机是国行吗"],
    ["u12", "国行，电源线 220V，配件都在"],
    ["u03", "用久了会不会出水慢，需要除垢不"],
    ["u12", "我上次除垢是三个月前，拿回去按说明再来一次就行"],
  ] },
  { item: 42, buyer: "u12", msgs: [
    ["u12", "猫爬架多大呀，我家阳台一米二"],
    ["u03", "高 1.4 米，底部 60×60，阳台放得下"],
    ["u12", "那我先看看实物，周六有空吗"],
  ] },
];

// 收藏：买家 → 物品序号
const FAVORITES = [
  ["u08", [1, 14, 15, 34, 40]], ["u02", [2, 3, 16, 39, 45]],
  ["u04", [8, 10, 30, 31, 44]], ["u05", [9, 19, 21, 25, 26]],
  ["u06", [10, 25, 33, 37, 40]], ["u09", [5, 24, 27, 28, 37]],
  ["u03", [12, 35, 36, 43]], ["u11", [6, 22, 23, 29, 32]],
  ["u12", [33, 36, 39, 42, 45]], ["u01", [2, 23, 30, 41]],
];

// 举报
const REPORTS = [
  { item: 45, by: "u05", reason: "疑似违禁品，打火机整盒出售不合规" },
  { item: 45, by: "u08", reason: "同一条，建议下架" },
  { item: 20, by: "u10", reason: "描述与实物不符，图片像是网图" },
  { item: 31, by: "u09", reason: "卖家一直不回复，疑似长期挂单" },
  { item: 13, by: "u12", reason: "联系方式疑似营销号" },
];

// ============ SQL 拼装 ============
const q = v => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const n = v => (v === null || v === undefined ? "NULL" : String(Number(v)));

function hashPw(pw, salt) {
  return pbkdf2Sync(pw, salt, 100000, 32, "sha256").toString("hex");
}

function buildCoreStatements() {
  const users = [];
  const items = [];
  const now = NOW;

  // ---- 用户 ----
  USERS.forEach((u, i) => {
    const salt = `seed${String(i + 1).padStart(2, "0")}salt0000000000000000`.slice(0, 32);
    const hash = hashPw(PASSWORD, salt);
    const created = now - (60 - i) * DAY;
    users.push(`INSERT INTO users(client_id, nickname, community, password_hash, password_salt, created_at)
      VALUES(${q(u.id)}, ${q(u.nick)}, ${q(u.c)}, ${q(hash)}, ${q(salt)}, ${n(created)})`);
  });

  // ---- 物品（id 交给自增，避免与线上既有记录主键冲突）----
  ITEMS.forEach((it, i) => {
    const owner = U[it.o];
    const age = it.age || 3;
    const created = now - age * DAY - Math.floor(rnd() * 8) * 3600000;
    const updated = created + Math.floor(rnd() * 6) * 3600000;
    const slug = CAT_SLUG[it.c];
    const imgs = [];
    for (let k = 0; k < (it.ph || 0); k++) imgs.push(k === 0 ? `/ph/${slug}.svg` : `/ph/${slug}b.svg`);
    const status = it.st || "available";
    items.push(`INSERT INTO items(owner_id, title, description, category, type, price, community,
        contact_name, contact_wechat, contact_phone, images, status, views, created_at, updated_at)
      VALUES(${q(owner.id)}, ${q(it.t)}, ${q(it.d)}, ${q(it.c)}, ${q(it.k)},
        ${it.p === undefined ? "NULL" : n(it.p)}, ${q(owner.c)}, ${q(owner.nick)},
        ${q("wx_" + it.o + "_" + (1000 + i))}, ${q("138" + String(10000000 + i * 137).slice(0, 8))},
        ${q(JSON.stringify(imgs))}, ${q(status)}, ${n(Math.floor(rnd() * 180) + (i % 7) * 12)},
        ${n(created)}, ${n(updated)})`);
  });

  return { users, items };
}

// idOf(序号) → 物品 id 表达式；用标题子查询，使 SQL 可独立导出/导入（本地 & 线上一致）
const idExpr = seq => `(SELECT id FROM items WHERE title = ${q(ITEMS[seq - 1].t)})`;

function buildRelationStatements(idOf) {
  const stmts = [];
  const now = NOW;

  // ---- 收藏 ----
  FAVORITES.forEach(([who, ids]) => {
    ids.forEach((seq, k) => {
      stmts.push(`INSERT INTO favorites(client_id, item_id, created_at)
        VALUES(${q(cid(who))}, ${idOf(seq)}, ${n(now - (30 - k * 3) * DAY)})`);
    });
  });

  // ---- 会话与消息 ----
  THREADS.forEach((th, thIdx) => {
    const base = now - (18 - Math.min(th.msgs.length, 10)) * DAY;
    const lastAt = base + (th.msgs.length - 1) * 3600000;
    // 未读规则：隔一个会话留一处未读，方便验证消息页红点
    const sellerUnread = thIdx % 2 === 0;
    stmts.push(`INSERT INTO conversations(item_id, buyer_id, seller_id, created_at, last_at, buyer_read_at, seller_read_at)
      SELECT ${idOf(th.item)}, ${q(cid(th.buyer))}, owner_id, ${n(base)}, ${n(lastAt)},
        ${n(sellerUnread ? lastAt : 0)}, ${n(sellerUnread ? 0 : lastAt)}
      FROM items WHERE id = ${idOf(th.item)}`);
    // 消息挂在刚插入的会话上（(item_id, buyer_id) 唯一）
    th.msgs.forEach((m, k) => {
      stmts.push(`INSERT INTO messages(conv_id, sender_id, body, created_at)
        SELECT id, ${q(cid(m[0]))}, ${q(m[1])}, ${n(base + k * 3600000)}
        FROM conversations WHERE item_id = ${idOf(th.item)} AND buyer_id = ${q(cid(th.buyer))}`);
    });
  });

  // ---- 举报 ----
  REPORTS.forEach((r, i) => {
    stmts.push(`INSERT INTO reports(item_id, client_id, reason, created_at)
      VALUES(${idOf(r.item)}, ${q(cid(r.by))}, ${q(r.reason)}, ${n(now - (9 - i) * DAY)})`);
  });

  return stmts;
}

function cleanStatements() {
  return [
    `DELETE FROM messages WHERE conv_id IN (SELECT id FROM conversations WHERE buyer_id LIKE 'seed-%' OR seller_id LIKE 'seed-%')`,
    `DELETE FROM conversations WHERE buyer_id LIKE 'seed-%' OR seller_id LIKE 'seed-%'`,
    `DELETE FROM favorites WHERE client_id LIKE 'seed-%' OR item_id IN (SELECT id FROM items WHERE owner_id LIKE 'seed-%')`,
    `DELETE FROM reports WHERE client_id LIKE 'seed-%' OR item_id IN (SELECT id FROM items WHERE owner_id LIKE 'seed-%')`,
    `DELETE FROM items WHERE owner_id LIKE 'seed-%'`,
    `DELETE FROM users WHERE client_id LIKE 'seed-%'`,
  ];
}

// ============ D1 REST ============
async function d1(sql, params) {
  const body = params ? { sql, params } : { sql };
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DB_ID}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data || data.success === false) {
    const msg = (data && data.errors && data.errors.map(e => e.message).join("; ")) || `HTTP ${res.status}`;
    throw new Error(`D1 执行失败：${msg}\nSQL 片段：${sql.slice(0, 200)}`);
  }
  return data.result && data.result[0];
}

// 批量执行：优先合并成一条多语句请求，失败则退化为逐条
async function runAll(stmts, label) {
  try {
    await d1(stmts.join(";\n"));
    console.log(`  ${label}：${stmts.length} 条语句 ✓`);
  } catch (e) {
    console.log(`  ${label}：合并提交失败，改为逐条执行…（${e.message.split("\n")[0]}）`);
    let ok = 0;
    for (const s of stmts) {
      try { await d1(s); ok++; }
      catch (err) { console.error("  失败语句：", s.slice(0, 120), "\n   ", err.message.split("\n")[0]); }
    }
    console.log(`  ${label}：${ok}/${stmts.length} 条成功`);
    if (ok === 0) throw new Error("全部语句失败");
  }
}

// ============ 站内占位图 ============
const PH_THEMES = {
  digital: [["#FFE6D6", "#FFD1BA", "#C2410C"], ["#E7EEFF", "#CFDCFB", "#1E40AF"]],
  home: [["#E8F5E9", "#CFE9D3", "#2E7D32"], ["#FFF6DC", "#FBE9BB", "#92400E"]],
  book: [["#EDE7F6", "#D9CDF0", "#5B21B6"], ["#FFE9EC", "#FBD0D6", "#9F1239"]],
  cloth: [["#FFF0F6", "#FBD6E4", "#9D174D"], ["#E0F7FA", "#BFE9EF", "#0E7490"]],
  baby: [["#FFF7E6", "#FCE7BF", "#B45309"], ["#F3E8FF", "#E2D0FB", "#6D28D9"]],
  sport: [["#E8F1FF", "#CBDFFB", "#1D4ED8"], ["#FFF3E0", "#FBDDB5", "#C2410C"]],
  food: [["#FFF1E6", "#FBD9BE", "#B45309"], ["#FDECEF", "#F8D3DA", "#BE123C"]],
  other: [["#F1F5F9", "#DDE5EE", "#334155"], ["#FFF4E5", "#FCE3C2", "#9A3412"]],
};
const CAT_LABEL = Object.fromEntries(Object.entries(CAT_SLUG).map(([k, v]) => [v, k]));

function phSvg(slug, variant) {
  const [c1, c2, ink] = PH_THEMES[slug][variant];
  const label = CAT_LABEL[slug];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480" width="640" height="480" role="img" aria-label="${label}闲置示例图">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="640" height="480" fill="url(#g)"/>
  <circle cx="88" cy="84" r="58" fill="#fff" opacity=".35"/>
  <circle cx="566" cy="404" r="86" fill="#fff" opacity=".22"/>
  <rect x="240" y="186" width="160" height="112" rx="16" fill="#fff" opacity=".55"/>
  <path d="M262 274 l38-46 30 34 24-26 34 38 z" fill="${ink}" opacity=".55"/>
  <circle cx="352" cy="212" r="10" fill="${ink}" opacity=".55"/>
  <text x="320" y="360" text-anchor="middle" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"
    font-size="46" font-weight="700" fill="${ink}" opacity=".92">${label}</text>
  <text x="320" y="398" text-anchor="middle" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif"
    font-size="19" fill="${ink}" opacity=".6">闲置交换 · 示例图</text>
</svg>
`;
}

function writePlaceholders() {
  const dir = join(ROOT, "public", "ph");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  let count = 0;
  for (const slug of Object.keys(PH_THEMES)) {
    writeFileSync(join(dir, `${slug}.svg`), phSvg(slug, 0), "utf8");
    writeFileSync(join(dir, `${slug}b.svg`), phSvg(slug, 1), "utf8");
    count += 2;
  }
  console.log(`占位图就绪：public/ph/ 共 ${count} 个 SVG`);
}

// ============ 主流程 ============
console.log(`目标 D1：${DB_ID}（account ${ACCOUNT.slice(0, 8)}…）`);
if (!FLAG("no-ph")) writePlaceholders();

const clean = cleanStatements();
const core = buildCoreStatements();
const relStmts = () => buildRelationStatements(idExpr);

if (FLAG("dry")) {
  console.log(`[dry] 清理 ${clean.length} 条 / 用户 ${core.users.length} / 物品 ${core.items.length} / 关系（收藏+会话+消息+举报）${relStmts().length} 条`);
  console.log(`[dry] 圈子 ${CIRCLES.length} 个 / 会话 ${THREADS.length} 个 / 举报 ${REPORTS.length} 条`);
  process.exit(0);
}

// --emit-sql[=file]：只在本地导出 SQL，不写库。
// 配合 `wrangler d1 execute --local --file=<file>` 可让本地 dev 库拥有与线上一致的测试数据。
const emitArg = argv.find(a => a.startsWith("--emit-sql"));
if (emitArg) {
  const file = emitArg.includes("=") ? emitArg.split("=")[1] : "seed-cloud.sql";
  const all = [...clean, ...core.users, ...core.items, ...relStmts()];
  writeFileSync(join(ROOT, file), all.join(";\n") + ";\n", "utf8");
  console.log(`已导出 SQL：${file}（${all.length} 条语句）`);
  console.log(`本地导入（需先停掉 pages dev，避免 SQLITE_BUSY）：`);
  console.log(`  npx wrangler d1 execute idle-exchange-db --local --persist-to ./.wrangler-dev-state --file=${file}`);
  process.exit(0);
}

console.log("① 清理旧的 seed 数据…");
await runAll(clean, "清理");

if (FLAG("clean")) { console.log("已清理，未写入新数据（--clean）"); process.exit(0); }

console.log("② 写入账号与物品…");
await runAll(core.users, "用户");
await runAll(core.items, "物品");

console.log("③ 写入收藏 / 私信 / 举报…");
await runAll(relStmts(), "关系数据");

console.log("④ 校验…");
const stat = await d1(`SELECT
  (SELECT COUNT(*) FROM users  WHERE client_id LIKE 'seed-%') AS users,
  (SELECT COUNT(*) FROM items  WHERE owner_id  LIKE 'seed-%') AS items,
  (SELECT COUNT(*) FROM favorites WHERE client_id LIKE 'seed-%') AS favs,
  (SELECT COUNT(*) FROM conversations WHERE buyer_id LIKE 'seed-%' OR seller_id LIKE 'seed-%') AS convs,
  (SELECT COUNT(*) FROM messages WHERE sender_id LIKE 'seed-%') AS msgs,
  (SELECT COUNT(*) FROM reports WHERE client_id LIKE 'seed-%') AS reports`);
console.log("  " + JSON.stringify(stat.results[0]));

console.log(`
完成。可用测试账号（密码统一 ${PASSWORD}）：
${USERS.map(u => `  ${u.nick}  ${u.c}`).join("\n")}
清理方式：node scripts/seed-cloud.mjs --clean
`);
