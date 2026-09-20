# 闲置交换 · 社区二手 / 闲置平台

> 小区、学校、公司内部的二手交易与闲置交换。把散落在微信群里的「卖闲置 / 免费送 / 换物 / 求购」信息，整理成可分类、可搜索、可上传图片的轻量平台。

## 功能

- **发布物品**：标题、分类、类型（出售 / 免费送 / 换物 / 求购）、价格、描述、所在小区/学校/公司、联系方式、最多 9 张图片。
- **图片上传**：图片存到 Cloudflare R2，前端多图预览、可删除、首图作封面。
- **分类 & 筛选**：按交易类型、分类、关键词搜索、价格排序快速定位。
- **联系发布者**：详情页展示昵称、微信号、手机号，一键复制。
- **标记已出 / 删除**：发布者可把物品标记为「已出」、重新上架或删除（按本地身份识别，仅本人可操作）。
- **我的发布**：按当前设备身份筛选本人发布的物品。

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
│   └── js/api.js                  # 全局 HTTP 客户端 / 工具
├── scripts/
│   ├── init-d1.mjs           # 远程初始化 D1 + R2 + 建表
│   └── apply-migration.mjs   # 应用单个迁移 SQL
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
-- category ∈ {数码,家居,图书,服饰,母婴,运动,美食,其他}
-- type      ∈ {sell, free, exchange, wanted}
-- status    ∈ {available, sold, removed}
```

`items.images` 存 R2 key 的 JSON 数组；图片通过 `/api/files/<key>` 公开读取。

## 本地开发

需要 [Node.js](https://nodejs.org/) 与 [Wrangler](https://developers.cloudflare.com/workers/wrangler/install/)。

```bash
npm install -g wrangler
wrangler pages dev --port 8802 --persist-to ./.wrangler-dev
# 打开 http://localhost:8802
```

本地首次访问 `/api/*` 时，`functions/_middleware.js` 会自动建表（D1 本地持久化在 `.wrangler-dev/`）。

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
   wrangler pages deploy . --project-name=idle-exchange
   ```
   在 Cloudflare Pages 项目设置里绑定：
   - D1 数据库：`idle-exchange-db`（变量名 `DB`）
   - R2 桶：`idle-exchange-images`（变量名 `R2`）

> 若未用 `--create`，请先在 Dashboard 手动创建 D1 数据库与 R2 桶，再执行 `node scripts/init-d1.mjs`。

## API 参考

| 方法 | 路径 | 说明 |
|------|------|------|
| GET  | `/api/items` | 列表。参数：`category` `type` `status` `owner` `q` `sort`(newest/price_asc/price_desc) `limit` `offset` |
| POST | `/api/items` | 发布。Body(JSON)：`clientId,title,category,type,price?,description?,community?,contactName,contactWechat?,contactPhone?,images[]` |
| GET  | `/api/items/:id` | 详情 |
| PATCH| `/api/items/:id` | 改状态。Body：`{clientId, status}`（sold/available/removed），仅发布者 |
| DELETE| `/api/items/:id?clientId=` | 删除，仅发布者 |
| GET  | `/api/items/:id?clientId=` | 详情（`views` 自增；带 clientId 时返回 `favorited`） |
| POST | `/api/items/:id/favorite` | 收藏。Body：`{clientId}` |
| DELETE| `/api/items/:id/favorite?clientId=` | 取消收藏 |
| POST | `/api/items/:id/report` | 举报。Body：`{clientId?, reason}` |
| GET  | `/api/favorites?clientId=` | 我的收藏列表（结构同列表接口） |
| POST | `/api/upload` | 上传图片（multipart `file` + `clientId`），限流 12 次/分钟，返回 `{key,url}` |
| GET  | `/api/files/:key` | 读取图片（公开） |

> **身份说明**：本 MVP 不做账号系统。发布者身份用一个本地生成的 `clientId`（存浏览器 `localStorage`）标识，用于「我的发布」与「标记已出 / 删除」的归属校验。同一浏览器即为同一发布者。

## 安全与限制

- 所有用户输入在渲染时经 `escapeHtml` 转义，防 XSS。
- 图片接口仅允许 `image/jpeg|png|webp`，单文件 ≤ 5 MB，key 做白名单防目录穿越。
- 发布 / 删除 / 改状态接口以 `clientId` 归属校验，越权返回 403。
- 上传接口当前对所有人开放（MVP 简化）。生产环境建议加频率限制 / 简单口令。
- 列表默认只展示 `status='available'`，`removed` 不公开。

## 开发路线图（Roadmap）

### v0.2 · 体验与防滥用 ✅（2026-09-20 完成）
- [x] 前端图片压缩（canvas 缩图 ≤1600px / JPEG 0.85，小图原图直传，解码失败兜底原图）
- [x] 浏览量统计（items.`views` 列，详情页访问自增并展示）
- [x] 收藏 / 取消收藏（`favorites` 表；详情页按钮 + 首页「收藏」筛选）
- [x] 上传频率限制（按 clientId 滑动窗口 12 次/分钟，超限 429）与举报入口（`reports` 表存档）
- [x] 列表骨架屏（加载占位动画）

### v0.3 · PWA 与成本优化
- [ ] manifest.json + Service Worker（可安装、离线骨架）
- [ ] R2 绑定自定义公开域名，图片直连 R2 替代 `/api/files` 代理
- [ ] SEO 基础（详情页 SSR 化或 prerender、og:image）

### v0.4 · 账号与互动
- [ ] 账号体系（微信登录 / 邮箱验证码）替代本地 `clientId`
- [ ] 站内私信（会话表 + 轮询或 Durable Objects）
- [ ] 用户主页（查看某人发布 / 在售）

### v0.5 · 运营与多社区
- [ ] Cron Worker 定时下架超期物品 + 冷数据归档
- [ ] 管理后台（违规处理、数据看板）
- [ ] 多社区 / 多圈子支持（按 `community` 聚合频道页）

> 版本遵循语义化：补丁位 `0.0.x` 日常迭代，次版本位 `0.x.0` 大功能。

## 版本历史

- **v0.2.0**（2026-09-20）：图片压缩上传、浏览量、收藏（含首页筛选）、举报、上传限流（12 次/分钟）、列表骨架屏。
- **v0.1.1**（2026-09-20）：新增站点 favicon；修复列表/详情图片不显示（后端统一把 R2 key 拼接为 `/api/files/<key>` 展示 URL）；补充开发路线图。
- **v0.1.0**（2026-09-20）：MVP 上线——发布 / 分类筛选 / 图片上传（R2）/ 联系发布者 / 标记已出 / 我的发布。

---

基于 Cloudflare Pages + Functions + D1 + R2 构建，纯边缘、零运维。
