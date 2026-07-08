# 01_05 开发执行指引

版本：v1.0 · 日期：2026-07-02 · 归属：全项目
关联主文档：[`../00-core/00_01_Dev_Doc.md`](../00-core/00_01_Dev_Doc.md) 的 §24（仓库结构）、§25（研发启动建议）、§33（技术栈决策）

---

## 1. 仓库结构习惯

- 采用 Moread 风格的根目录独立子项目：`backend/`、`miniprogram/`、`admin/`、`database/`、`docs/`。
- 不采用 `apps/` monorepo、pnpm workspace 或 Turborepo，除非后续出现明确的跨端构建收益并经文档决策更新。
- 每个可运行子项目独立维护 `package.json`、lockfile、环境示例和构建命令；根目录不放统一 npm 脚手架。
- `database/` 放项目级数据库事实源，例如 `schema.sql`、RLS、人工审计 SQL、跨服务共享的数据库脚本；后端不维护第二套 ORM schema。
- `miniprogram/` 和 `admin/` 在真实开工前只保留占位，不提前引入脚手架。

## 2. 后端开发习惯

- 后端事实入口是 `backend/`；当前栈为 NestJS + Fastify + node-postgres。
- API 统一前缀 `/api/v1`；破坏性变更升 `/api/v2`，不要在实现里绕过 `01_02_Api_Spec.md`。
- M1 合约先放 `backend/src/contracts/`，使用 Zod 定义请求/响应；只有当小程序或后台出现稳定直接复用需求时，再抽独立共享包。
- 多租户查询必须通过服务端注入 `tenant_id` / `account_id` 与 RLS 上下文，禁止接受前端传入 tenant_id。
- 公开名片读取与访问 token 签发分离：`GET /public/cards/{public_id}` 只返回可缓存公开内容，`POST /visit` 才签发 `visit_token`。

## 3. 验证习惯

后端变更至少运行以下命令：

```bash
cd backend
npm run build
npm run typecheck
npm test
npm run lint
npm audit --omit=dev
```

- 安全审计优先消除生产依赖漏洞；本项目后端已改用 Fastify 适配器以避免 Express/Multer 链路带来的高危审计噪音。
- 测试以真实框架入口为准；Fastify 场景优先用 `app.inject()` 做 HTTP 层测试。

??????????`cd database && npm run rls:validate`????????? `npm run migrate` / `npm run check`?

## 4. 部署边界

- 后端 API 使用专用二级域名，例如 `api.example.com`，供微信小程序和后台调用。
- 后台管理站点使用独立域名，例如 `admin.example.com`，与 API 域名分离。
- 后台访问入口不等于 API 路径；后台页面路由和 API 路由分别治理，避免把 `/api/v1/admin/*` 暴露成用户需要记忆的后台入口。
- 微信小程序只面向 API 域名通信，后续按微信平台域名白名单和 HTTPS 要求配置。

## 5. 文档同步习惯

- 结构、技术栈、接口路径、数据库隔离策略发生变化时，同步更新 `00_01_Dev_Doc.md` 与对应 `01-specs` 文档。
- 审计报告只记录审计证据与修复结果；长期执行习惯沉淀到本文件。
- 当前实现若与文档冲突，以代码验证结果为准，并立即修正文档事实源。
