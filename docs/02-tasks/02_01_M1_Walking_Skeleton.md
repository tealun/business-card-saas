# 02_01 M1 Walking Skeleton（垂直切片）

版本：v1 · 日期：2026-07-01 · 归属：全栈
关联：主文档 §19（里程碑）、§23（验收）、§14（API 分组）、§15/§15.4（DDL）
前置：[`02_00_M0_Platform_Verification.md`](02_00_M0_Platform_Verification.md) 完成

> 目标：打通一条最薄的垂直切片，尽早验证企业微信服务商模式。只写阻塞项与验收项。

## 垂直切片范围

员工从企业微信工作台打开 → `wx.qy.login` 识别 `open_userid` → 按需建档 + 默认名片 → 名片详情页 → 生成 `public_id` 公开链接 → 客户公开访问 + `visit_token` 埋点。

## 阻塞项

| # | 事项 | 依赖 | 状态 |
|---|------|------|------|
| 1 | 脚手架：NestJS(Node 24) + Prisma(PG 17+) + Redis，monorepo 共享 types | §33 | ☐ |
| 2 | 迁移建表最终形态（含 §15.4：public_card_directory、关键 FK、部分唯一索引、channel NOT NULL） | §15/§15.4 | ☐ |
| 3 | `TenantTx.run` RLS 事务包装器 + 越权测试基线（§33.2 / §20.3） | A4-P1-10 | ☐ |
| 4 | `qy-login`：jscode2session → 定位 tenant + member_identity → 按需建档 + 默认名片 | 02_00 #2/#3 | ☐ |
| 5 | 员工名片读取/更新（01_02 §3.2） | | ☐ |
| 6 | 公开访问：public_card_directory 解析 public_id → RLS 查 cards → 隐私判定输出 | A4-P0-1 | ☐ |
| 7 | `visit_token` 签发与动作幂等（§14.6） | A4-P1-7 | ☐ |
| 8 | owner bootstrap 最小闭环（§15.4） | A4-P1-5 | ☐ |

## 验收标准（对齐主文档 §23）

- 员工从企业微信打开自动识别身份并看到自己的默认名片。
- 客户用公开链接访问，无登录也能看到隐私判定后的字段，动作上报带 `visit_token` 且幂等。
- 越权测试：A 企业上下文查不到 B 企业数据；无 tenant 上下文默认拒绝。
- CI 绿：迁移可回滚、越权测试、API schema 测试通过（§20.6）。

## 失败条件

- 公开访问需要给公开角色加 `BYPASSRLS` 才能跑通 → 说明 public_card_directory 流程未落地，退回修正。
