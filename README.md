# 企业名片 SaaS

基于**企业微信第三方服务商**模式的企业电子名片 SaaS：员工从企业微信/微信打开自己的名片并分享，客户访问、保存、加企微，企业侧统计转化与沉淀客户。多租户、隐私默认收紧、PIPL 合规。

## 当前状态

- 阶段：**M1 walking skeleton 已进入前后端联调态**。后端 NestJS + node-postgres 骨架、`database/schema.sql` 初始建库脚本、RLS baseline、demo 企业微信登录、员工名片读取/更新/分享、公开名片访问/visit/action 骨架已落地；小程序已按 `docs/design` 交付完成员工首页、编辑资料、名片样式、访客详情、名片夹、企业名片与兼容名片页的统一 UI 落地。
- 企业微信平台适配：已完成第三方应用配置、回调验签/AES 解密、指令回调 URL 验证、`suite_ticket` 加密存储、`suite_access_token` singleflight 刷新、授权回调 `auth_code -> permanent_code` 与企业 access_token 获取；下一步是真实 `jscode2session`。
- 下一步：按 [`docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md`](docs/02-tasks/02_02_First_Enterprise_Wecom_Admin_Plan.md) 推进首个真实企业接入；优先完成真实 PostgreSQL 验证、企业微信 M0-M1 gate 实测、真实 `jscode2session`/授权回调替换 demo 登录，并在微信开发者工具/企业微信工作台跑通最薄端到端闭环。

## 本地验证

1. 复制环境配置并填写所有必填 secret：

```powershell
cd backend
copy .env.example .env
# 编辑 .env，将 JWT_SECRET / ADMIN_JWT_SECRET / VISIT_TOKEN_SECRET / WECOM_* 替换为强随机值
```

2. 后端静态与单元验证：

```powershell
cd backend
npm run typecheck
npm test
npm run rls:validate
```

3. 如果本机有 Docker，可一键启动完整栈（包含后端、PostgreSQL、Redis）：

```powershell
$env:POSTGRES_USER="postgres"
$env:POSTGRES_PASSWORD="postgres"
docker compose up -d
```

或仅启动数据库后跑真实数据库探针：

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

服务器 PgSQL 联调建议顺序（所有 secret 必须显式设置，无 fallback）：

```powershell
cd backend
# Generate 32-byte base64 keys with:
# node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
$env:DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DB"
$env:JWT_SECRET="<32+ chars random>"
$env:ADMIN_JWT_SECRET="<32+ chars random>"
$env:VISIT_TOKEN_SECRET="<32+ chars random>"
$env:CARD_FIELD_ENCRYPTION_KEY_BASE64="<32-byte base64>"
$env:WECOM_STATE_ENCRYPTION_KEY_BASE64="<32-byte base64>"
$env:WECOM_SUITE_ID="<your-suite-id>"
$env:WECOM_SUITE_SECRET="<your-suite-secret>"
$env:WECOM_CALLBACK_TOKEN="<your-callback-token>"
$env:WECOM_CALLBACK_AES_KEY="<43-char aes key>"
$env:WECOM_DATA_CALLBACK_TOKEN="<your-data-callback-token>"
$env:WECOM_DATA_CALLBACK_AES_KEY="<43-char aes key>"
$env:WECOM_AUTH_LAUNCH_TOKEN="<random-launch-token>"
$env:WECOM_INSTALL_REDIRECT_URI="https://api.example.com/api/v1/wecom/authorization-complete"
$env:CORS_ORIGINS="https://admin.example.com"
npm run build
npm start
```

生产库只执行 `database/schema.sql` + `database/rls.sql` 初始化；不要执行 `db:verify`。非本地一次性测试库运行 `db:verify` 时需要额外设置 `DB_VERIFY_ALLOW_NONLOCAL=1`。

## 自动部署

GitHub Actions 自动部署配置见：

- 后端：[`docs/88-planning/88_01_Backend_Deployment_Guide.md`](docs/88-planning/88_01_Backend_Deployment_Guide.md)
- 管理后台：[`docs/88-planning/88_02_Admin_Deployment_Guide.md`](docs/88-planning/88_02_Admin_Deployment_Guide.md)
- 后端部署目录通过 GitHub Secret `BACKEND_DEPLOY_PATH` 或 `DEPLOY_PATH` 配置，不在 workflow 中写死
- 管理后台部署目录通过 GitHub Secret `ADMIN_DEPLOY_PATH` 配置；如果后台和后端在不同服务器，使用 `ADMIN_DEPLOY_HOST` / `ADMIN_DEPLOY_USER` / `ADMIN_DEPLOY_PORT` / `ADMIN_DEPLOY_SSH_KEY` 或 `ADMIN_DEPLOY_PASSWORD`
- 认证方式：优先 SSH key，缺失时使用密码
- 保护内容：服务器 `.env`、缓存、日志、上传文件、证书、`node_modules`、`dist` 等运行态内容不会被 CI 删除或覆盖

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
