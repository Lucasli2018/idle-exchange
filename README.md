# 闲置交换 · 社区二手 / 闲置平台

> 小区、学校、公司内部的二手交易与闲置交换。把散落在微信群里的「卖闲置 / 免费送 / 换物 / 求购」信息，整理成可分类、可搜索、可上传图片的轻量平台。

## 功能

- **发布物品**：标题、分类、类型（出售 / 免费送 / 换物 / 求购）、价格、描述、所在小区/学校/公司、联系方式、最多 9 张图片。
- **图片上传**：图片存到 Cloudflare R2，前端多图预览、可删除、首图作封面。
- **分类 & 筛选**：按交易类型、分类、关键词搜索、价格排序快速定位。
- **账号登录**：账号 + 密码注册 / 登录（昵称即账号）；浏览公开，发布 / 收藏 / 私信等写操作需登录，登录后自动回跳原页面。
- **联系发布者**：详情页展示昵称、微信号、手机号，一键复制。
- **标记已出 / 删除**：发布者可把物品标记为「已出」、重新上架或删除（按登录账号识别，仅本人可操作）。
- **我的发布**：按登录账号筛选本人发布的物品。

## 技术架构

| 层 | 技术 | 说明 |
|----|------|------|
| 前端 | 静态 HTML + 原生 JS（经典 `<script>`，无构建） | `public/`，珊瑚橙主题，移动端优先 |
| 接口 | Cloudflare Pages Functions | `functions/api/*` |
| 数据库 | Cloudflare D1（SQLite） | `env.DB`，存 `users` / `items` |
| 对象存储 | Cloudflare R2 | `env.R2`，存物品图片 |

> 零构建、零后端服务，部署即静态托管 + 边缘函数。

## 目录结构

```
idle-exchange/
├── wrangler.toml            # Pages 配置：D1 + R2 绑定
├── schema.sql               # D1 建表 SQL（线上初始化用）
├── functions/
│   ├── _shared/helpers.js    # JSON 响应 / 校验 / 时间工具
│   ├── _middleware.js        # 全局 CORS + 首次访问自动建表（本地开发）
│   └── api/
│       ├── items/
│       │   ├── index.js      # GET 列表 / POST 发布
│       │   └── [id].js       # GET 详情 / PATCH 标记 / DELETE 删除
│       ├── upload.js         # POST 图片上传到 R2
│       └── files/[key].js    # GET 从 R2 读取图片（公开）
├── public/
│   ├── index.html + js/home.js    # 列表 / 筛选页
│   ├── post.html  + js/post.js    # 发布表单页
│   ├── item.html  + js/detail.js  # 物品详情页
│   ├── css/style.css              # 珊瑚橙主题
│   ├── ph/*.svg                   # 分类占位图（测试数据用，不占 R2）
│   └── js/api.js                  # 全局 HTTP 客户端 / 工具
├── scripts/
│   ├── init-d1.mjs           # 远程初始化 D1 + R2 + 建表
│   ├── apply-migration.mjs   # 应用单个迁移 SQL
│   ├── seed-dev.mjs          # 本地 dev D1 灌少量数据（跑通用）
│   ├── seed-cloud.mjs        # 真实规模测试数据（12 账号 / 46 物品 / 收藏 / 私信 / 举报）
│   │                         #   默认直写线上 D1；--emit-sql=<f> 导出 SQL 供本地导入
│   ├── probe-auth.mjs        # 后端接口探针（鉴权）
│   ├── probe-list.mjs        # 列表 & 详情体验探针（筛选落 URL / 分页 / 推荐 / 按钮归属）
│   ├── probe-ui.mjs          # 前端交互探针（登录拦截 / 回跳）
│   └── probe-mobile.mjs      # 手机端布局探针（320/375/768/1285 视口 + 截图）
└── migrations/               # 后续 schema 演进
```

## 数据模型（D1）

```sql
users(client_id PK, nickname, community, created_at)
items(id PK, owner_id, title, description, category, type,
      price, community, contact_name, contact_wechat, contact_phone,
      images(JSON), status, views, created_at, updated_at)
favorites(id PK, client_id, item_id, created_at, UNIQUE(client_id,item_id))
reports(id PK, item_id, client_id, reason, created_at)
conversations(id PK, item_id, buyer_id, seller_id, created_at, last_at,
              UNIQUE(item_id,buyer_id))
messages(id PK, conv_id, sender_id, body, created_at)
-- category ∈ {数码,家居,图书,服饰,母婴,运动,美食,其他}
-- type      ∈ {sell, free, exchange, wanted}
-- status    ∈ {available, sold, removed}
```

`items.images` 存图片 URL 的 JSON 数组：
- R2 key（默认）→ 展示时拼成 `/api/files/<key>`（或配置 `R2_PUBLIC_BASE` 后直连 R2）
- 以 `/` 开头的站内路径（如 `/ph/digital.svg`）、`http(s)://` 外链、`data:` 内联 → 原样透传，不占 R2

## 本地开发

需要 [Node.js](https://nodejs.org/) 与 [Wrangler](https://developers.cloudflare.com/workers/wrangler/install/)。

```bash
npm install -g wrangler
wrangler pages dev --port 8802 --persist-to ./.wrangler-dev
# 打开 http://localhost:8802
```

本地首次访问 `/api/*` 时，`functions/_middleware.js` 会自动建表（D1 本地持久化在 `.wrangler-dev/`）。

### 灌测试数据（两种）

```bash
# A. 少量数据，够跑探针
node scripts/seed-dev.mjs

# B. 真实规模数据（12 账号 / 46 物品 / 8 圈子 / 收藏 / 私信 / 举报）
node scripts/seed-cloud.mjs --emit-sql=.wrangler-dev-state/seed.sql   # 导出 SQL
# 需先停掉 pages dev，否则 SQLITE_BUSY
wrangler d1 execute idle-exchange-db --local --persist-to ./.wrangler-dev-state \
  --file=.wrangler-dev-state/seed.sql
```

### 探针（本地回归）

```bash
node scripts/probe-auth.mjs      # 后端鉴权（14 项）
node scripts/probe-list.mjs      # 列表/详情体验（37 项，需 >30 条物品以验证分页）
node scripts/probe-ui.mjs        # 前端登录拦截与回跳（17 项）
node scripts/probe-mobile.mjs    # 手机端布局（40 项，输出截图到 .probe-shots/）
```

## 第一次部署

1. **创建 D1 与 R2**（Dashboard 或脚本）
   ```bash
   export CLOUDFLARE_API_TOKEN="<具备 D1/R2 编辑权限的 token>"
   node scripts/init-d1.mjs --create   # 自动建库 + 建桶 + 建表
   ```
2. **填写 `wrangler.toml`**
   - 把 `database_id` 换成实际 D1 数据库 ID（Dashboard → D1 → 你的库 → 概览）。
   - 把 `bucket_name` 确认是 `idle-exchange-images`（或在 `init-d1.mjs` 里改一致）。
3. **部署**
   ```bash
   wrangler pages deploy public --project-name=idle-exchange
   ```
   > ⚠️ 必须指定 `public` 目录。若用 `deploy .`，wrangler 会把整个项目根当作静态资产上传（路径带 `public/` 前缀），导致前端资源 404。
   在 Cloudflare Pages 项目设置里绑定：
   - D1 数据库：`idle-exchange-db`（变量名 `DB`）
   - R2 桶：`idle-exchange-images`（变量名 `R2`）

4. **（可选）R2 图片直连**：给 `idle-exchange-images` 桶绑定自定义公开域（或开启 r2.dev 开发域），然后在 Pages 项目环境变量里加 `R2_PUBLIC_BASE=https://你的公开域`。配置后图片 URL 直接指向 R2，不再经过 `/api/files` 函数代理；不配置则一切照旧。
5. **（可选）管理后台**：设置管理口令后访问 `/admin`
   ```bash
   wrangler pages secret put ADMIN_KEY --project-name=idle-exchange
   ```
   未配置时管理接口返回 503（功能停用，不影响前台）。
6. **（可选）邮箱登录（Cloudflare Access OTP）**
   - Dashboard → Zero Trust → Access → Applications → 新建 **Self-hosted** 应用：
     Domain 填 `idle-exchange.pages.dev`、Path 填 `/api/access-login`；策略 Allow + Include Everyone（One-time PIN 默认可用）。
   - 记下应用的 **AUD tag** 与团队域（`<team>.cloudflareaccess.com`），然后：
     ```bash
     wrangler pages secret put ACCESS_TEAM_DOMAIN --project-name=idle-exchange
     wrangler pages secret put ACCESS_AUD --project-name=idle-exchange
     ```
   - 未配置时邮箱登录按钮会提示未启用，其余功能不受影响。

> 若未用 `--create`，请先在 Dashboard 手动创建 D1 数据库与 R2 桶，再执行 `node scripts/init-d1.mjs`。

## API 参考

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/items` | 列表。参数：`category` `type` `status` `owner` `community` `q` `sort`(newest/price_asc/price_desc) `limit` `offset` |
| POST | `/api/items` | 发布。Body(JSON)：`clientId,title,category,type,price?,description?,community?,contactName,contactWechat?,contactPhone?,images[]` |
| GET  | `/api/items/:id` | 详情 |
| PATCH| `/api/items/:id` | 改状态。Body：`{clientId, status}`（sold/available/removed），仅发布者 |
| DELETE| `/api/items/:id?clientId=` | 删除，仅发布者 |
| GET  | `/api/items/:id?clientId=` | 详情（`views` 自增；带 clientId 时返回 `favorited`） |
| POST | `/api/items/:id/favorite` | 收藏。Body：`{clientId}` |
| DELETE| `/api/items/:id/favorite?clientId=` | 取消收藏 |
| POST | `/api/items/:id/report` | 举报。Body：`{clientId?, reason}` |
| GET  | `/api/favorites?clientId=` | 我的收藏列表（结构同列表接口）。支持 `category` `type` `q` `limit` `offset` 筛选与分页 |
| POST | `/api/items/:id/message` | 给发布者发私信。Body：`{clientId, body}`（自动建会话） |
| GET  | `/api/threads?clientId=` | 我的会话列表（含对方昵称/物品标题/最后一条/未读数，顶层 `totalUnread`） |
| GET  | `/api/threads/:id?clientId=` | 会话消息流（仅参与者） |
| POST | `/api/threads/:id` | 会话内回复。Body：`{clientId, body}` |
| GET  | `/api/communities` | 活跃圈子聚合（30 天内在售按 community 计数） |
| POST | `/api/auth/register` | 注册（绑定 clientId + 账号 + 密码，账号占用返回 409） |
| POST | `/api/auth/login` | 登录（账号+密码 → client_id，账号或密码错误统一 401） |
| GET  | `/api/auth/available?nickname=` | 注册时实时校验账号是否可用（已设密码的注册账号才算占用） |
| GET  | `/api/auth/me` | 邮箱登录状态（Cookie 会话 → `{email, boundClientId, boundSelf}`） |
| POST | `/api/auth/bind-email` | 邮箱绑定到当前设备账号（需邮箱会话，重复绑定 409） |
| GET  | `/api/access-login` | Cloudflare Access OTP 回跳点（建会话 Cookie → 回 `/auth.html?access=1`） |
| GET  | `/api/admin/overview` | 管理概览（统计 + 举报列表）。Header：`X-Admin-Key` |
| POST | `/api/admin/items/:id` | 管理下架/恢复。Body：`{action: remove\|restore}` |
| POST | `/api/upload` | 上传图片（multipart `file` + `clientId`），限流 12 次/分钟，返回 `{key,url}` |
| GET  | `/api/files/:key` | 读取图片（公开） |

> **写接口鉴权（v0.7.0 起）**：除 `/api/auth/*` 与各 GET 接口外，POST / PATCH / DELETE 写接口均要求已登录账号；服务端校验该 `clientId` 已绑定账号（`password_hash` 非空），未登录统一返回 `401 请先登录…`。

> **身份说明（v0.7.0 起：强制账号登录）**：本平台用轻量账号（账号 + 密码，昵称即登录账号）识别用户；底层归属校验仍基于本地生成的 `clientId`（存浏览器 `localStorage`），登录会把本地 `clientId` 切换为该账号的身份，使发布 / 收藏 / 会话跨设备找回。
>
> - **浏览公开**：列表 / 详情 / 圈子 / 他人主页无需登录即可查看。
> - **写操作需登录**：发布、收藏、私信、回复、举报、上传图片、「我的发布 / 收藏」、消息页均要求登录；未登录点击会跳转登录页，登录后自动回跳原页面。
> - **服务端兜底**：所有写接口都会校验 `clientId` 已绑定账号，未登录返回 `401`，防止伪造 `clientId` 绕过前端。

## 安全与限制

- 所有用户输入在渲染时经 `escapeHtml` 转义，防 XSS。
- 图片接口仅允许 `image/jpeg|png|webp`，单文件 ≤ 5 MB，key 做白名单防目录穿越。
- 发布 / 删除 / 改状态接口以 `clientId` 归属校验，越权返回 403。
- 写操作（发布 / 收藏 / 私信 / 回复 / 举报 / 上传）需账号登录：服务端校验 `clientId` 已绑定账号（`password_hash` 非空），未登录统一返回 401。
- 上传接口需登录，并限流 12 次/分钟（早期「对所有人开放」已收紧）。
- 列表默认只展示 `status='available'`，`removed` 不公开。

## 开发路线图（Roadmap）

### v0.2 · 体验与防滥用 ✅（2026-09-20 完成）
- [x] 前端图片压缩（canvas 缩图 ≤1600px / JPEG 0.85，小图原图直传，解码失败兜底原图）
- [x] 浏览量统计（items.`views` 列，详情页访问自增并展示）
- [x] 收藏 / 取消收藏（`favorites` 表；详情页按钮 + 首页「收藏」筛选）
- [x] 上传频率限制（按 clientId 滑动窗口 12 次/分钟，超限 429）与举报入口（`reports` 表存档）
- [x] 列表骨架屏（加载占位动画）

### v0.3 · PWA 与成本优化 ✅（2026-09-20 完成）
- [x] PWA：manifest + PNG 图标（512/192/180）+ Service Worker（静态 network-first 离线可用、图片 cache-first、其余 API 不接管），可安装到桌面
- [x] R2 自定义公开域直连：配置 Pages 环境变量 `R2_PUBLIC_BASE`（如绑定了自定义域或开启 r2.dev）即直连 R2；未配置自动回退 `/api/files` 代理
- [x] SEO 基础：meta description / og 标签 / theme-color（列表页可索引，发布与详情页 noindex，等 SSR 后放开）
- [ ] 详情页 SSR / prerender（per-item og:image）→ 移至 v0.4+，需要架构调整

### v0.4 · 账号与互动（2026-09-20 部分完成）
- [x] 站内私信：详情页「私信发布者」→ 会话（买家×物品唯一）→ 消息页会话列表/聊天视图（15s 轮询），参与者校验
- [x] 用户主页：详情页点发布者昵称查看 TA 的所有发布与在售数
- [ ] 账号体系（微信登录 / 邮箱验证码）→ 顺延 v0.5（依赖外部服务/资质，需配置 Resend 或微信开放平台）
- [ ] 私信未读数 / 推送提醒（依赖账号与订阅消息）

### v0.5 · 账号与运营 ✅（2026-09-20 完成）
- [x] 轻量账号：账号 + 密码（昵称即登录账号，PBKDF2-SHA256 10万轮），注册即绑定当前设备身份，任何设备可登录找回物品/收藏/会话；微信/邮箱登录待外部资质，列 v0.6
- [x] 物品新鲜度：公共列表仅展示 30 天内发布；发布者可一键「擦亮」重新进入窗口（替代 Cron 定时下架，零新增部署）
- [x] 管理后台（`/admin`）：`ADMIN_KEY` 口令守卫、统计概览、举报处理、物品下架/恢复
- [ ] 多社区 / 多圈子支持（按 `community` 聚合频道页）→ v0.6

### v0.7 · 强制账号登录 ✅（2026-09-20 完成）
- [x] 全站改为账号密码登录制：浏览公开；发布 / 收藏 / 私信 / 回复 / 举报 / 上传 / 我的 / 消息需登录
- [x] 未登录点击写操作 → 跳登录页，登录后自动回跳原页面（`?redirect=`）
- [x] 后端所有写接口增加「`clientId` 已绑定账号」校验（未登录 401），防伪造身份绕过前端

### v0.6 · 规划中
- [x] **邮箱登录（Cloudflare Access OTP，方案一）**：无需邮件服务资质——Access 应用保护 `/api/access-login`，用户输邮箱收一次性验证码（Cloudflare 代发），Function 验证 ES256 JWT 拿到邮箱 → 7 天会话 Cookie → 绑定/切换本站身份。需配置 Pages 环境变量 `ACCESS_TEAM_DOMAIN` 与 `ACCESS_AUD`（未配置时该入口返回 503，不影响其它功能）。
- [ ] 微信登录（需服务号资质，可用 `cloudflare-wx-api` 开源方案）
- [ ] 私信未读数与推送提醒
- [ ] 多圈子频道页
- [ ] Cron Worker 冷数据归档（如仍需要）

> 版本遵循语义化：补丁位 `0.0.x` 日常迭代，次版本位 `0.x.0` 大功能。

## 版本历史

- **v0.7.2**（2026-09-21）：**列表体验打磨 + 分页修复**——① 修复 `limit`/`offset` 被静默忽略（`getNumber` 用下标从 `URLSearchParams` 取值恒为 `undefined`），此前「加载更多」只是重复第一页并产生重复卡片；② 筛选条件同步到 URL（可分享 / 刷新保留），并把 URL 状态回填到下拉与 chips；③ 新增结果计数条（含当前筛选条件）与「清空筛选」入口；④ 区分「搜索无结果」与「频道暂无物品」两种空态；⑤ 翻页到底显示结束提示；⑥ 详情页新增同类闲置推荐（横向滑动，排除自身）；⑦ 收藏列表支持分类 / 类型 / 关键词筛选；⑧ 修复「擦亮」按钮对非发布者显示但点了没反应的 bug；⑨ 图片字段支持站内路径 / 外链 / data URI 原样透传（测试数据用 `/ph/*.svg` 占位图，不占 R2）；⑩ 新增 `scripts/seed-cloud.mjs`（真实规模测试数据，可直写线上 D1 或导出 SQL）与 `scripts/probe-list.mjs`（37 项体验探针），探针统一改为条件轮询，消除固定 sleep 导致的偶发假红。
- **v0.7.1**（2026-09-21）：**UI 与手机端适配优化**——登录 / 注册入口放大为顶栏右侧醒目白底胶囊按钮（带呼吸光晕，登录态切换为「昵称 + 退出」）；移除首页登录提示横幅（信息合并进按钮）；顶栏在窄屏拆为两行（品牌+登录按钮 / 四个等宽导航），筛选区下拉两列换行、卡片两列自适应（560px+ 三列）、详情/消息/表单/认证页触控尺寸 ≥ 40px、输入框 16px 防 iOS 聚焦缩放、全站接入刘海与底部安全区；新增 `scripts/probe-mobile.mjs` 手机端布局探针（40 项断言）与 `scripts/seed-dev.mjs` 本地数据填充。
- **v0.7.0**（2026-09-20）：改为**强制账号登录**——浏览公开，发布 / 收藏 / 私信 / 回复 / 举报 / 上传 / 我的 / 消息需登录，未登录跳登录页且登录后回跳；后端全部写接口校验「clientId 已绑定账号」（401 兜底），防伪造身份。
- **v0.6.1**（2026-09-20）：私信未读数（红点角标+会话清零）、圈子频道（聚合筛选、详情页圈子直达）。
- **v0.6.0**（2026-09-20）：邮箱登录（Cloudflare Access OTP 方案一，免邮件服务资质；需配置 Access 应用与环境变量后启用）。
- **v0.5.0**（2026-09-20）：轻量账号（账号+密码跨设备找回）、物品 30 天新鲜度与一键擦亮、管理后台（/admin，举报处理+下架）。
- **v0.4.0**（2026-09-20）：站内私信（会话/聊天/轮询）、用户主页；账号体系顺延 v0.5。
- **v0.3.0**（2026-09-20）：PWA（manifest+图标+Service Worker，可安装/离线可用）、R2 公开域直连（`R2_PUBLIC_BASE` 可配置，回退代理）、SEO 基础 meta。
- **v0.2.0**（2026-09-20）：图片压缩上传、浏览量、收藏（含首页筛选）、举报、上传限流（12 次/分钟）、列表骨架屏。
- **v0.1.1**（2026-09-20）：新增站点 favicon；修复列表/详情图片不显示（后端统一把 R2 key 拼接为 `/api/files/<key>` 展示 URL）；补充开发路线图。
- **v0.1.0**（2026-09-20）：MVP 上线——发布 / 分类筛选 / 图片上传（R2）/ 联系发布者 / 标记已出 / 我的发布。

---

基于 Cloudflare Pages + Functions + D1 + R2 构建，纯边缘、零运维。
