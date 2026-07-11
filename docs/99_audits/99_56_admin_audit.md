# 99_56 — 管理后台（鉴权 + 界面）专项审计 — 2026-07-11

## Scope

- Baseline: main@2a886f5；worktree clean
- 范围：`backend/src/admin-*`（auth/bootstrap/config/database/management）、`admin/`（前端）、`main.ts`/`app.module.ts` 安全配置
- Auto-selected depth: deep（风险信号：admin 面 + 鉴权 + PII + 企微对接，score ≥ 6）
- 审计动机：用户反馈「没有鉴权、界面拉跨」

## 总评（先说结论）

**「没有鉴权」不成立**——后端鉴权链路完整且质量高于本项目多数模块：企微 code 登录 → HMAC-SHA256 签名令牌 → 全控制器 Guard → 服务层四级 RBAC → RLS 双层租户隔离，且有测试覆盖。
**「界面拉跨」成立**——`admin/` 本质是 M1 联调控制台（手贴 token、API Base 输入框、JSON 输出面板、debug 按钮），不是产品级后台；且**无登录墙、无 401 处理、无登出**，这正是「感觉没鉴权」的来源：页面不拦你，只有接口在拦。

真正的问题不是「没做」，而是：**1 个已实锤的限流失效缺陷 + 令牌生命周期短板 + 前端产品化欠账**。

## System Goal & Critical Paths

- 保护目标：租户配置与成员 PII（手机/邮箱/微信号）只能被本租户的、角色足够的管理员读写。
- 路径 A 管理员登录（code → jscode2session → findActiveAdmin/claimOwner → HMAC token）：**At risk**（限流失效 A-P1-1、令牌不可撤销 A-P1-2）
- 路径 B 管理端读写（Bearer → Guard → RBAC → TenantTx RLS → SQL）：**Healthy**（逐端点核对，见「已确认的强项」）
- 路径 C 首个 owner 引导（bootstrapOwner → claim token → 登录认领）：**Broken（运维层）**——无任何生产入口（A-P1-5）
- 路径 D 管理员使用界面（打开页面 → 贴 token → 操作）：**At risk（体验层）**（A-P1-3/A-P1-4）

## Confirmed Strengths（经证据核实，整改时必须保留）

| 项 | 证据 |
|----|------|
| Guard 全覆盖 | 5 个 admin 控制器逐一核对 `@UseGuards(AdminAuthGuard)`，唯一例外是登录端点本身（admin-auth.controller.ts） |
| 令牌实现正确 | HMAC-SHA256、先验签后解码、`timingSafeEqual`、8h 过期；`ADMIN_JWT_SECRET` 缺失时启动即抛错（secrets.ts） |
| 四级 RBAC | owner>admin>operator>auditor（admin-rbac.ts）；写操作全部设卡：跑迁移=owner、配置写/成员同步=admin、改成员名片=operator |
| 租户隔离双保险 | admin-management.repository 全部走 `TenantTx.run(session.tenantId)`（RLS 上下文）+ SQL 里显式 `tenant_id = $1` |
| claim token 设计 | 24 字节随机、SHA-256 落库、15 分钟 TTL、`UPDATE ... WHERE used_at IS NULL` 原子一次性消费（owner-bootstrap.repository.ts:192-200） |
| 前端无注入面 | app.js 891 行全程 `textContent` 渲染，零 `innerHTML`；token 用 sessionStorage（标签页级）而非 localStorage；页面带 CSP meta |
| 传输层 | 生产强制 CORS 白名单（main.ts:18-19）、helmet CSP、全局限流 100/min |

## Findings

### P1 — 应尽快整改

| ID | Type | Confidence | Status | 标题 | 位置 | 证据与影响 | 整改建议 |
|----|------|------------|--------|------|------|-----------|---------|
| A-P1-1 | Confirmed | High | Open | **全部命名 @Throttle 覆盖失效** | app.module.ts:34-42 + 全部控制器 | ThrottlerModule 只注册了 `default`；库源码（throttler.guard.js:44,77）证实 guard 只按已注册 throttler 的名字读路由覆盖 → `login`(5/15min)、`adminMutation`(20/min)、`identity`、`callback`、迁移(3/5min) 全是死元数据，实际一律 100/min。登录爆破、迁移滥触的预期防线不存在 | 在 ThrottlerModule 注册同名 throttlers：`login`、`adminMutation`、`identity`、`callback`（各配显式 ttl/limit），并加一条回归测试断言命名限流生效 |
| A-P1-2 | Confirmed | High | Open | 管理令牌不可撤销、无刷新 | admin-session-token.service.ts | 自包含 HMAC 令牌，无版本号/黑名单：管理员离职或降权后旧 token 仍有效至多 8h；无 refresh，8h 一到强制重登 | 短期：session 里加 `token_version`，落库到 tenant_admins，verify 时比对（一次 DB 读，可缓存）；中期：短 TTL(1h) + refresh token |
| A-P1-3 | Confirmed | High | Fixed (68a0a06) | 前端无登录墙、无 401 处理、无登出 | admin/app.js（grep 无 logout/401 处理） | 未登录也渲染全部控制台；token 过期后每个按钮各自报错；无登出入口。这是「感觉没鉴权」的直接来源 | 已修：登录门（boot 时校验 /admin/session/me）、adminRequest 统一拦 401 清会话回登录页、顶栏登出按钮与身份徽标 |
| A-P1-4 | Confirmed | High | Open | 界面是联调控制台，不是产品后台 | admin/index.html:435-499 | 「授权与联调」面板把 demo 登录、claim token 输入、visit/derive share 调试入口直接暴露给企业管理员；主反馈是 JSON `<pre>`；顶栏常驻 API Base 输入框 | 见「整改路线」两档方案 |
| A-P1-5 | Confirmed | Medium | Open | 首个 owner 引导无生产入口 | owner-bootstrap.service.ts:17（grep 无调用方） | `bootstrapOwner`/`createClaimToken` 没有任何 HTTP 端点或 CLI 脚本调用；新租户开通首个 owner 只能手写 SQL，无运行手册 | 加平台级 CLI 脚本（如 `backend/scripts/bootstrap-owner.cjs`，读 DATABASE_URL，产出 claim token），写入部署文档；不要做成 HTTP 端点 |

### P2 — 建议改进

| ID | Type | Confidence | Status | 标题 | 位置 | 说明 | 整改建议 |
|----|------|------------|--------|------|------|------|---------|
| A-P2-1 | Confirmed | High | Fixed (68a0a06) | API Base 可任意改写且 token 随请求发出 | admin/app.js:64,91 | 管理员被诱导改 API Base 后，token 会发往攻击者域 | 已修：生产固定同源 `/api/v1`，API Base 输入与「授权与联调」面板仅 dev 模式（?dev=1 / file:// / localhost）显示 |
| A-P2-2 | Exposure | Medium | Open | 读端点不区分角色，auditor 可读全量成员 PII | admin-management.service.ts:32-77 | overview/members/card 读取仅要求「是管理员」；auditor（rank 1）也能看手机/邮箱明文 | 评估是否为设计意图；若 auditor 定位是「看报表」，成员名片读取应升为 operator，或对 auditor 掩码手机号 |
| A-P2-3 | Confirmed | Medium | Open | 无管理操作审计日志 | admin-config/management service | 仅迁移有身份日志；改配置、改成员名片、同步无结构化留痕，出事无法追责 | 加统一 admin 操作日志（who/what/when/before-after 摘要），pino 结构化即可，暂不必进库 |
| A-P2-4 | Confirmed | High | Open | 界面无加载/成功反馈体系 | admin/app.js:564-571 | 操作反馈靠输出面板文字变化，无 loading 态禁用、无 toast、错误原文直出 | 归入 A-P1-4 整改一并做 |

## 整改路线（建议按序执行，先不动代码）

1. **立即（半天）**：A-P1-1 注册命名 throttlers + 回归测试。这是唯一实锤的安全缺陷。
2. **短期（1-2 天）**：A-P1-3 登录墙 + 401 统一处理 + 登出；A-P2-1 移除生产 API Base 输入。做完这两条，「没鉴权」的观感即消失。
3. **短期（半天）**：A-P1-5 owner 引导 CLI + 运行手册。
4. **中期（1 天）**：A-P1-2 token 版本号撤销机制。
5. **中期（按排期）**：A-P1-4 界面产品化，两档任选：
   - **A 档·整容**（1-2 天）：现有 vanilla JS 上拆掉联调面板（仅 dev 显示）、加 loading/toast/空态、JSON 面板折叠为「高级」、视觉走一遍设计规范。成本低，够内部用。
   - **B 档·重建**（1-2 周）：Vue3/React + 组件库重建正式后台（登录页、布局、表格、表单校验、权限按角色显隐），现页面降级为 dev console 保留。面向外部租户管理员必选 B 档。
6. **顺带**：A-P2-2 角色-数据可见性评审、A-P2-3 操作审计日志。

## Verification Gaps

- 生产 `ADMIN_JWT_SECRET` 强度、`CORS_ORIGINS` 实际值未验证（无生产 env 访问权）。
- `deploy-admin.yml` 与 nginx 对 `admin/` 的实际托管配置未审。
- `card-field-cipher.service.ts`（PII 字段加密）未深入审计，本次仅确认其存在。
- 限流失效（A-P1-1）基于库源码静态证明，未做运行时打压测试复现。

## 12-Dimension Coverage（限 admin 范围）

1 架构：模块边界清晰（auth/bootstrap/config/database/management 分包），无越权 reach-in ✅ · 2 平台对接：企微 code 登录复用 wecom 模块，未深审 △ · 3 安全：见 findings，主缺陷 A-P1-1 · 4 代码高效：app.js 891 行单文件已到可维护边缘，重建时拆分 · 5 运行流畅：前端无 loading 态（A-P2-4） · 6 信息隔离：TenantTx+RLS 双层 ✅ · 7 数据准确：overview 计数 SQL 核对无误 ✅ · 8 参数传递：Bearer header + zod 契约校验 ✅ · 9 UX：主要欠账（A-P1-3/4） · 10 编码规范：与后端整体一致 ✅ · 11 测试：guard/rbac/service 均有 spec ✅，缺「命名限流生效」测试（A-P1-1 附带） · 12 部署运维：owner 引导断链（A-P1-5），deploy-admin.yml 未审 △

## Evidence Log

- A-P1-1：Accepted — `@nestjs/throttler@6.5.0` dist/throttler.guard.js:44（未命名默认为 `default`）+ :77（按已注册名读覆盖）；模块仅注册 default；全仓 @Throttle 均用未注册名。
- A-P1-2：Accepted — token service 无任何撤销查询；verify 纯本地验签。
- A-P1-3：Accepted — `grep logout|401|removeItem admin/app.js` 零命中（token 清除仅登录失败分支）。
- A-P1-5：Accepted — `grep createOwner|bootstrapOwner backend/src`（排除 spec/自身模块）零调用方。
- 「无鉴权」指控：Rejected — 逐控制器核对 guard；RBAC/隔离见强项表。
- claim token 重放风险：Rejected — 原子单次消费 + TTL + SHA-256 落库，设计正确。
