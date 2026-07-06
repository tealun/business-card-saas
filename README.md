# 企业名片 SaaS

基于**企业微信第三方服务商**模式的企业电子名片 SaaS：员工从企业微信/微信打开自己的名片并分享，客户访问、保存、加企微，企业侧统计转化与沉淀客户。多租户、隐私默认收紧、PIPL 合规。

## 当前状态

- 阶段：**M1 walking skeleton 已进入前后端联调态**。后端 NestJS + node-postgres 骨架、`database/schema.sql` 初始建库脚本、RLS baseline、demo 企业微信登录、员工名片读取/更新/分享、公开名片访问/visit/action 骨架已落地；小程序已按 `docs/design` 交付完成员工首页、编辑资料、名片样式、访客详情、名片夹、企业名片与兼容名片页的统一 UI 落地。
- 企业微信平台适配：已完成第三方应用配置、回调验签/AES 解密、指令回调 URL 验证、`suite_ticket` 加密存储、`suite_access_token` singleflight 刷新、授权回调 `auth_code -> permanent_code` 与企业 access_token 获取；下一步是真实 `jscode2session`。
- 下一步：按 [`docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md`](docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md) 推进首个真实企业接入；优先完成真实 PostgreSQL 验证、企业微信 M0-M1 gate 实测、真实 `jscode2session`/授权回调替换 demo 登录，并在微信开发者工具/企业微信工作台跑通最薄端到端闭环。

## 本地验证

后端静态与单元验证：

```powershell
cd backend
npm run typecheck
npm test
npm run rls:validate
```

如果本机有 Docker，可启动本地 PostgreSQL / Redis 后跑真实数据库探针：

```powershell
docker compose up -d postgres redis
cd backend
$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5432/business_card_saas"
npm run db:verify
```

`db:verify` 是**破坏性测试探针**：它会重建目标库的 `public` schema，应用 `database/schema.sql` 和 `database/rls.sql`，再插入探针数据验证租户隔离；默认只允许 `localhost` / `127.0.0.1` 数据库，避免误清非本地库。详细边界见 [`database/README.md`](database/README.md)。

## 多端入口

- 后端 API：[`backend/`](backend/)
- 静态后台工作台：[`admin/index.html`](admin/index.html)
- 微信小程序骨架：[`miniprogram/`](miniprogram/)（三栏 Tab：我的名片 / 名片夹 / 企业名片）

服务器 PgSQL 联调建议顺序：

```powershell
cd backend
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB"
$env:JWT_SECRET="<32+ chars random>"
$env:VISIT_TOKEN_SECRET="<32+ chars random>"
$env:CORS_ORIGINS="https://admin.example.com"
npm run build
npm start
```

生产库只执行 `database/schema.sql` + `database/rls.sql` 初始化；不要执行 `db:verify`。非本地一次性测试库运行 `db:verify` 时需要额外设置 `DB_VERIFY_ALLOW_NONLOCAL=1`。

## 阅读入口

文档全部在 [`docs/`](docs/)，索引见 [`docs/README.md`](docs/README.md)。建议顺序：

1. [`docs/00-core/00_01_Dev_Doc.md`](docs/00-core/00_01_Dev_Doc.md) — 主开发文档 / 全项目事实源（先读 §0 结论、§1 目标、§33 技术栈）。
2. 身份模型 §5、总体架构 §3、数据隔离 §16。
3. 里程碑 §19、验收 §23。

## 技术栈（§33 为唯一事实源）

Node.js 24 LTS + TypeScript + NestJS · PostgreSQL 17+（RLS 多租户）· node-postgres (`pg`) · Redis / BullMQ · React + Vite + Ant Design（后台）· 原生微信小程序 · 腾讯云 COS / KMS · Docker → Kubernetes · GitHub Actions。

## M0 / M1 目标

- **M0**：平台/服务商资质与应用接入（有审核周期，并行前置轨）+ 企业微信关键接口实测 Spike（见 [`docs/02-tasks/02_00_M0_Platform_Verification.md`](docs/02-tasks/02_00_M0_Platform_Verification.md)）。
- **M1**：垂直切片 walking skeleton — 员工从企业微信工作台打开 → wx.qy.login 识别 → 名片详情 → 公开访问埋点（见 [`docs/02-tasks/02_01_M1_Walking_Skeleton.md`](docs/02-tasks/02_01_M1_Walking_Skeleton.md)）。
