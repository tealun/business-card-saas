# Audit #01 — 开发文档设计审计

日期：2026-07-01
审计对象：`docs/wecom-business-card-saas-dev-doc.md` (v0.2)
审计类型：设计文档审计（documentation-only 仓库，无代码可扫）
模式：auto / 深度：deep（风险信号：多租户 + Auth/OAuth + PII 手机号邮箱 + Webhook 回调，风险分 ≥6）

## Scope

- 仓库当前仅含该开发文档，无 `apps/`、无代码。
- 审计方法：以微信小程序 / 企业微信第三方应用 / 多租户 SaaS / PIPL 的真实平台约束为基准，核对文档内部一致性与外部可行性。
- 所有「验证」为文档自洽性与平台事实核对（无代码 grep）。

## Summary

- P0: 5 | P1: 7 | P2: 7

---

## P0 — Must Fix

| ID | 标题 | 位置 | 证据 | 修复方向 |
|----|------|------|------|----------|
| D-P0-1 | unionid 获取前置条件未说明 | §5.2, §6.2 | account 以 `wx_unionid` 为主键；`wx.login`/code2session 仅在小程序已绑定微信开放平台且同主体有授权记录时返回 unionid | 增加 unionid 获取前置条件与 openid-only 降级路径；account 主键容错 |
| D-P0-2 | suite_ticket 接收/存储缺失 | §8.3 | 缓存了 suite_access_token 却无 suite_ticket 来源（企业微信每 10min 推送到指令回调） | 增加 suite_ticket 接收、存储、驱动 suite_access_token 刷新的流程 |
| D-P0-3 | 指令回调 vs 数据回调未区分 | §8.1, §8.4 | 第三方应用为两个独立回调 URL，密钥与职责不同，文档合为一个 | 拆分两类回调的 URL、密钥、事件路由 |
| D-P0-4 | PIPL/个人信息合规整章缺失 | 全篇 | 处理手机号/邮箱/微信号/external_userid + 访客埋点，无隐私政策、告知同意、留存期限、删除导出、敏感信息单独同意 | 新增合规章节（见补充） |
| D-P0-5 | unionid→external_userid 前置条件未标注 | §10 | 需企业已认证 + 已配置客户联系 + 小程序与企业微信同一开放平台主体绑定 | 明确前置条件矩阵与失败降级，避免 M4 设计跑不通 |

## P1 — Should Fix

| ID | 标题 | 位置 | 说明 |
|----|------|------|------|
| D-P1-1 | DDL 缺表 | §9, §12.3, §15 | 正文引用 `contact_ways`/`contact_way_states` 但 DDL 无；`templates`/`licenses`/`audit_logs`/回调幂等表/分享统计聚合表全缺 |
| D-P1-2 | 回调幂等无落地设计 | §8.4, §17.2 | 仅「幂等处理」，无 msg_id/event 去重表与键 |
| D-P1-3 | member_identity 主键与第三方应用现实不符 | §5.4 | 第三方应用通常仅得 open_userid，userid 需通讯录+自建应用；唯一键应以 open_userid 为准 |
| D-P1-4 | token 刷新竞争无分布式锁 | §8.3 | §20.5 列为测试项，§8.3 无 Redis 锁/单飞方案 |
| D-P1-5 | 软删除与审计字段缺失 | §15 | 无 deleted_at/created_by；audit-logs 有页面无表；PIPL 删除权需要 |
| D-P1-6 | 手机号/头像昵称获取方式过时 | §5.2, §7.2 | getPhoneNumber 为付费+button 触发；getUserProfile 不再返回昵称头像 |
| D-P1-7 | 通讯录同步细节缺失 | §13.3 | change_type 增量事件、部门、权限范围、离职处理未展开 |

## P2 — Nice to Have

| ID | 标题 | 位置 |
|----|------|------|
| D-P2-1 | API 无版本前缀/统一错误码/分页规范 | §14 |
| D-P2-2 | 无可观测性 SLO/指标/链路追踪 | §3 |
| D-P2-3 | 无备份/灾备/回滚策略 | — |
| D-P2-4 | 海报生成方案与 SSRF 防护无设计 | §17.3 |
| D-P2-5 | 企业微信接口频率限额管理无规划 | §13.9 |
| D-P2-6 | 测试计划无 CI/覆盖率目标/验收指标 | §20 |
| D-P2-7 | cards UNIQUE(member_identity_id) 与 M5 多名片存在设计张力 | §5.6 |

## Verification Log

- ✅ D-P0-1 — 确认 §5.2 accounts 以 wx_unionid 为唯一键（第1148行），§6.2 未提 unionid 获取前置
- ✅ D-P0-2 — 确认 §8.3（第633-648行）缓存 suite_access_token，全文无 suite_ticket
- ✅ D-P0-3 — 确认 §8.1（第604行）单一「回调 URL」，§8.4 授权/客户事件混列
- ✅ D-P1-1 — 确认 §9.1/§9.2 定义 contact_ways/contact_way_states，§15 DDL（第1137-1304行）无此二表及 templates/licenses/audit_logs
- ✅ D-P1-3 — 确认 §5.4 同时用 userid 与 open_userid，唯一键含两者

## Next Steps

1. 按补充清单向文档新增合规、回调、DDL 补全、可观测性等章节（附加式，不改原有内容）。
2. 之后进入实现阶段（M1 小程序名片基础能力）。
