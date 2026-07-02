# 02_01 M1 Walking Skeleton（垂直切片）

版本：v1 · 日期：2026-07-01 · 归属：全栈
关联：主文档 §19（里程碑）、§23（验收）、§14（API 分组）、§15/§15.4（DDL）
前置：[`02_00_M0_Platform_Verification.md`](02_00_M0_Platform_Verification.md) 的 **M0-M1 gate** 完成（#1–#6）；M0-M3 gate 不阻塞本切片

> 目标：打通一条最薄的垂直切片，尽早验证企业微信服务商模式。只写阻塞项与验收项。

## 垂直切片范围

员工从企业微信工作台打开 → `wx.qy.login` 识别 `open_userid` → 按需建档 + 默认名片 → 名片详情页 → 生成 `public_id` 公开链接 → 客户公开访问 + `visit_token` 埋点。

## 阻塞项

| # | 事项 | 依赖 | 状态 |
|---|------|------|------|
| 1 | 脚手架：NestJS(Node 24) + Prisma(PG 17+) + Redis，独立子项目 contracts | §33 | ☑ |
| 2 | 迁移建表最终形态（含 §15.4：public_card_directory、关键 FK、部分唯一索引、channel NOT NULL） | §15/§15.4 | ☐ |
| 3 | `TenantTx.run` RLS 事务包装器 + 越权测试基线（§33.2 / §20.3） | A4-P1-10 | ☐ |
| 4 | `qy-login`：jscode2session → 定位 tenant + member_identity → 按需建档 + 默认名片 | 02_00 #2/#3 | ◐ 骨架完成 |
| 5 | 员工名片读取/更新（01_02 §3.2） | | ◐ 当前读取 + 分享签发完成 |
| 6 | 公开访问：public_card_directory 解析 public_id → RLS 查 cards → 隐私判定输出 | A4-P0-1 | ◐ demo 公开读取完成 |
| 7 | `visit_token` 签发与动作幂等（§14.6） | A4-P1-7 | ◐ 内存骨架完成 |
| 8 | owner bootstrap 最小闭环（§15.4） | A4-P1-5 | ☐ |

## 当前落地记录

- 2026-07-02：提交 `befc204` 后继续落地 M1 骨架。
- `backend/` 已具备 NestJS + Fastify + Prisma 独立 npm 子项目，contracts 暂放 `backend/src/contracts/`。
- 已实现 `POST /api/v1/auth/qy-login` 的 demo code 登录骨架，返回员工 access token、当前身份和默认 `public_id`；真实企业微信 `jscode2session` 待 M0 实测凭据完成后替换 repository。
- 已实现 `GET /api/v1/employee/cards/current` 和 `POST /api/v1/employee/cards/current/share`，可用 bearer token 读取当前员工默认名片并签发 `share_id`。
- 已实现公开名片 `GET /api/v1/public/cards/{public_id}`、`POST /visit`、`POST /actions` 的 demo 闭环，GET 不下发 `visit_token`，动作上报幂等。

## 验收标准（对齐主文档 §23）

- 员工从企业微信打开自动识别身份并看到自己的默认名片。
- 客户用公开链接访问，无登录也能看到隐私判定后的字段，动作上报带 `visit_token` 且幂等。
- GET 内容成功但 `POST /visit` 失败时，名片公开字段仍渲染；需要 `visit_token` 的动作进入短重试 / 弱提示，重试失败不阻断保存电话等本地能力，统计标记为丢失或低可信（审计 A7-P2-5）。
- 越权测试：A 企业上下文查不到 B 企业数据；无 tenant 上下文默认拒绝。
- CI 绿：迁移可回滚、越权测试、API schema 测试通过（§20.6）。

## 失败条件

- 公开访问需要给公开角色加 `BYPASSRLS` 才能跑通 → 说明 public_card_directory 流程未落地，退回修正。
