# 02_05 本地企业与企业微信解耦开发计划

状态: In progress · 日期: 2026-07-20
关联: `00_01_Dev_Doc.md`、`00_02_Database_Schema.md`、`01_11_Local_Enterprise_And_Identity.md`

## 规划契约

- Done: 本地企业无需 open_corpid 可创建并完成一名员工邀请、绑定、建卡、停用的 walking skeleton；既有企微授权链路保持可用。
- Validation: fresh schema + forward migration + 后端 lint/typecheck/test/build + 两条端到端验收录像/日志。
- Fail: 本地租户仍需伪造 corpid、普通微信被当成企业归属证明、连接失效导致本地名片不可用，或跨租户绑定可发生。

## 实施顺序

| Gate | 工作 | 状态 | 证据/完成条件 |
|---|---|---|---|
| D1 | `tenants` 增加来源、open_corpid 可空、未连接状态；企微写入显式标记来源 | 代码完成；真实 DB 待验 | migrate_v1_15；迁移排序与 RLS 静态校验通过，因本机无 DATABASE_URL 尚未执行 PostgreSQL verify |
| D2 | 平台企业列表展示来源/连接状态；本地企业禁止企微同步 | 已完成 | 2026-07-20 typecheck/lint/build + 29 tests passed；本地企业同步拒绝用例覆盖 |
| D3 | 本地企业创建/认领 API，owner 首次建档 | 代码完成 | `POST /local-enterprises` 创建本地 tenant/member/card/owner 并返回后台会话；真实 DB E2E 待验 |
| D4 | 成员预建、CSV 导入、一次性个人邀请 | 部分完成 | 单成员预建+24h一次性 token 已完成；CSV 待后续批次 |
| D5 | 微信登录后绑定成员；公共企业码进入待审批 | 后端完成 | 个人邀请可原子绑定；公共企业码只提交 pending，owner/admin 审批后才创建成员、名片和绑定 |
| D6 | 企业内容、模板、成员停用和公开名片完整回归 | 待办 | 本地企业 E2E |
| D7 | 新增 tenant_connectors，双写、回填、核对后切读 | 待办 | 计数一致、可回滚切读 |
| W0 | 账号调用许可官方后台与真实接口取证 | 阻塞正式售卖 | 截图、订单、错误码、试用和接口分类 |
| W1 | 已有本地企业连接企微并安全匹配成员 | 待办 | 冲突预览、人工确认、取消连接降级 |

## 当前批次范围

本批只完成 D1/D2 地基，不实现邀请 UI，不删除 `tenants` 中既有企微凭据列，不改变公开名片和现有企微回调契约。
