# 99_72 — 管理后台账号登录系统就绪审计 — 2026-07-17

## Scope

- Project phase: pre-implementation → M0 取证完成，进入 M1 实现
- Reviewed artifacts: `01_09_Admin_Account_Auth_System_Spec.md`（v2）、`02_04_Admin_Account_Auth_Gates.md`（v2）、`migrate_v1_14.sql`（草案）、2026-07-17 仓库只读勘察 + 企微官方文档取证（91121 / 100073 / 98170 / 91200 / 97159）
- Verdict: **Ready for M1 implementation**（M0 文档/代码取证完成，P0 降级为"待部署联调实证"；生产启用以部署联调门槛 D-1/D-2 为准）

## Summary

- P0: 0（原 2 项经官方文档取证降级，转部署联调门槛）
- P1: 4
- P2: 4
- Main risk: 真实回调的字段大小写 / userid 明文密文策略 / 成员授权模式空列表，只能在部署联调实证——已隔离为 02_04 D-2 门槛，代码侧按文档 + 防御性解析实现。

## P0 — Must Resolve（已关闭 / 转门槛）

| ID | Status | Title | Evidence | Impact | Recommendation |
|---|---|---|---|---|---|
| A-P0-1 | Doc-verified → D-2 | `get_admin_list` 接口形态 | 官方 100073：`POST /cgi-bin/agent/get_admin_list`，**企业凭证**（复用 `wecom-corp-token.service.ts`）；返回 `admin:[{userid,auth_type}]`；成员授权模式不返回；旧 suite 方式不再维护 | 判定接口已确认存在且仓库具备全部凭据设施 | 按 100073 实现；部署联调取真实响应样例回填 02_04 D-2 |
| A-P0-2 | Doc-verified → D-1/D-2 | 扫码登录链路选型 | 官方 98170：新版企业微信登录组件（回调 `code`），旧 `3rd_qrConnect`+`get_login_info` 为旧链路；官方 91121：`getuserinfo3rd`（suite_access_token）返回 `corpid/userid/open_userid`；域名不匹配报 50001 | 链路已按官方推荐更正（01_09 v2），避免按旧链路返工 | 前置配置「登录授权」+ 可信域名（D-1，用户 ops）；M1 前端联调定稿组件参数 |

## P1 — Resolve Before Module Coding

| ID | Status | Title | Evidence | Impact | Recommendation |
|---|---|---|---|---|---|
| A-P1-1 | Open | `tenant_admins` 无第二管理员添加通道，现有 `INSERT` 仅在首个 owner 认领 | 勘察：`owner-bootstrap.repository.ts` 为唯一 INSERT 来源 | 无自动建档则"企业管理员扫码即入"不成立 | 01_09 §4.2 upsert 规则覆盖，M1-S1 验证 |
| A-P1-2 | Open | `AdminAuthGuard` 是否每次请求查库校验账号 status 未确认 | `admin-auth.guard.ts`（行为未走查） | 若仅验签，禁用/删除后存量会话在 8h 内仍有效 | M1-S7：走查并记录决策（查库校验 or 接受窗口） |
| A-P1-3 | Open | `platform_admins` role 现状（取值/约束名）与迁移草案的一致性未经 pre-flight | `migrate_v1_14.sql` PRE-FLIGHT P1–P4 | 盲目执行可能约束冲突或角色归一遗漏 | 执行前跑 pre-flight 查询，对照 `database/schema.sql` |
| A-P1-4 | Closed | 扫码 state 的 CSRF/一次性方案 | 01_09 §4.2 v2：SHA-256 存储、TTL 10min、单次使用、绑定 client_ip/user_agent；官方 98170 回调带 state | 方案已定稿 | 按 01_09 v2 实现 |

## P2 — Deferred

| ID | Title | Trigger / Owner |
|---|---|---|
| A-P2-1 | 企微管理员撤销无回调，本地档案可能滞留 | M2 周期对账任务（登录时实时校验已兜底） |
| A-P2-2 | 会话撤销 / MFA 缺失 | M2（`99_21` Residual Risk 同项）；高权限平台账号优先 |
| A-P2-3 | 多企业管理员的选择/切换页 | M2；M1 以企微返回 corpid 单企业登录 |
| A-P2-4 | `qy-login` 手动 jscode 通道退役策略 | M2，扫码链路稳定后 |

## Gates

- Can start now: **M1 全部实现**——平台账号 CRUD（M1-S4）与扫码登录后端/前端（接口形态已经官方文档核实，单测可 mock 企微客户端先行）。
- Must wait: 生产环境真实启用扫码登录，依赖部署联调门槛 D-1（服务商后台「登录授权」+ 可信域名配置，用户 ops）与 D-2（首个真实企业扫码联调）。
- Evidence needed: D-1 配置截图；D-2 脱敏响应样例；`admin-auth.guard.ts` 走查记录；迁移 pre-flight 输出。
- Next artifact: M1 实现完成后的验证记录（02_04 S 项回填）+ 迁移正式版（pre-flight 通过后）。

## Doc Updates Needed

- `docs/README.md`：已登记 01_09 / 02_04（2026-07-17）。
- `docs/98_evolution/evolution-ledger.md`：已追加 EV-2026-07-17-admin-auth-plan-landing。
- `01_04_Admin_Web_Guide.md`：扫码登录落地后更新登录方式章节（当前仅覆盖密码 + jscode 联调通道）。
- `00-core/00_01_Dev_Doc.md`：实现启动时同步里程碑与身份模型章节。
