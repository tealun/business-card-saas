# 99_70 - Admin 设计稿降级数据可开发价值评估

日期：2026-07-17
范围：`docs/design/design_handoff_admin_backoffice` 系统后台（platform，已于 b261d0c 落地）与企业后台（tenant，本轮落地）两份设计稿中，因后端无真实数据源而被降级、省略或替换的数据点。
评估原则：**不用假数据**。每个数据点评估「真实数据可得性 → 可开发价值 → 工作量 → 优先级结论」。

## 结论速览

| 优先级 | 含义 | 条目 |
|--------|------|------|
| P0 本轮实现 | 数据已在库中或可由真实数据计算，改动小 | 租户成员部门（名片字段）/职位/联系方式/名片状态/最近访问、管理员停用、analytics 30 天趋势、资料完整度（前端计算）、租户侧 accountType 鉴权 |
| P1 近期迭代 | 价值高但需要新建表/埋点，独立排期 | 操作审计日志（平台+租户共用）、平均停留时长埋点 |
| P2 中期规划 | 依赖产品决策或外部接入 | 平台 MFA、订单处理写端点、平台视角额度账本、审计分页、转化率/留资漏斗、成员最近同步时间、部门筛选与企微部门名称映射 |
| P3 暂缓 | 依赖未发生的前提（企微上架、队列/缓存基建） | 套餐企微版本 ID、迁移完整执行日志、健康检查分项探针、额度用量趋势快照 |

---

## 一、系统后台（platform）降级项

### 1. 操作审计：操作者/角色/风险级别/IP/request_id —— P1
- 设计稿：审计中心表格含操作者、角色、风险级别、IP、request_id。
- 现状：后端只有 `callback_events`（企微回调事件流水），全库无操作审计表；上轮已用真实回调数据落地该页。
- 价值：**高**。平台合规与安全追溯的刚需，也是租户侧审计页（设计稿同样是操作审计）的共用底座。
- 工作量：中。新建 `admin_operation_logs(tenant_id, actor_admin_id, actor_role, action, target_type, target_id, result, detail_json, ip, request_id, created_at)` + 在各 admin 写接口埋点 + 平台/租户两个查询端点 + 分页。
- 结论：**P1，独立迭代**。建议平台、租户一次做齐，避免两套口径。

### 2. 平台 MFA —— P2
- 设计稿：安全中心含双因素认证开关。
- 现状：平台密码登录无二次验证；`platform_admins` 无 TOTP 字段。
- 价值：中高。平台 owner 账号是最高权限入口。
- 工作量：中。TOTP 秘钥表 + 登录流程插入验证步骤 + 恢复码 + 设置页。
- 结论：**P2**。上线前安全加固批次做。

### 3. 套餐的企业微信版本 ID / 停售可见性 —— P3
- 设计稿：套餐管理含企微版本关联与停售状态。
- 现状：`commercial_plans` 有 `status` 但无企微版本字段；企微应用市场上架流程尚未发生。
- 价值：低-中（仅上架后才有意义）。工作量：小（加列 + 管理端点）。
- 结论：**P3**，企微上架前再做。

### 4. 订单处理写端点（标记支付/退款/关闭）—— P2
- 现状：`commercial_orders` 只读；支付回写依赖尚未接入的支付 provider。
- 价值：中。工作量：小-中（PATCH 状态机 + 幂等）。
- 结论：**P2**，随支付接入一起做，避免手工 SQL 改单。

### 5. 平台视角额度账本 —— P2
- 现状：`tenant_quota_ledger` 表已存在，租户版 `/admin/commercial` 已返回；平台侧无跨租户查询端点。
- 价值：中（运营调额审计）。工作量：小（表现成，加平台查询端点 + 页面区块）。
- 结论：**P2**。

### 6. 审计/事件分页 —— P2
- 现状：`audit-events` / `sync-events` 固定返回最近 100 条，无游标/页码。
- 价值：中。工作量：小（offset/limit 参数 + 前端分页器）。
- 结论：**P2**，随操作审计日志一起统一分页口径。

### 7. 迁移完整执行日志持久化 —— P3
- 现状：上轮已加 `applied_details`（含 run_on），满足"哪些迁移跑过"；完整 stdout 日志未持久化。
- 价值：低-中。工作量：小-中。
- 结论：**P3**。

### 8. 健康检查队列/缓存/WeCom 分项探针 —— P3
- 现状：`/admin/platform/health` 覆盖 DB 等基础项；队列、缓存基建尚未接入。
- 价值：中（运维）。工作量：中，且依赖基建先落地。
- 结论：**P3**，随队列/缓存实际接入再做，现在做是空壳。

---

## 二、企业后台（tenant）降级项

### 1. 成员部门列 + 部门筛选 —— 拆分
- 设计稿：成员表有部门列与「全部部门」下拉。
- 现状（代码核实）：`member_identities.department_json` 存的是企微**部门 ID**（`JSON.stringify(user.departmentIds)`，见 `wecom-contact-sync.repository.ts`），全库从未调用企微部门列表接口，ID 无法映射成名称；唯一人类可读的部门数据在名片加密字段 `fields.department`（员工自助/管理员编辑写入）。
- 结论：**P0 本轮实现部门列**——取名片 `fields.department` 真实值，未填写显示 —；**部门筛选与企微部门名称映射降级为 P2**——需接入企微部门列表接口（ID→名称）或新增明文部门列（加密字段无法做 SQL 过滤与 distinct）。

### 2. 成员职位/手机/邮箱 + 名片状态 —— P0
- 设计稿：姓名粗体 + 职位 + 手机/邮箱掩码 + 名片状态 tag（已启用/已停用/同步失败）。
- 现状：列表 SQL 已 LEFT JOIN 主名片取 `public_id`，扩展选择 `title/mobile/email/status` 即可。
- 注意：「同步失败」无数据源——同步失败体现在 `callback_events`，不落成员。**不造该状态**，本轮状态只有 已启用/已停用/未创建（无名片）。
- 价值：高。工作量：小。结论：**P0 本轮实现**，掩码在前端展示层做。

### 3. 成员最近访问时间 —— P0
- 现状：`card_visits.member_identity_id + created_at` 可 `max()` 聚合。
- 价值：中（活跃度判断）。工作量：小（标量子查询）。
- 结论：**P0 本轮实现** `last_visit_at`。

### 4. 成员最近同步时间 —— P2
- 现状：`member_identities` 无同步时间戳；`updated_at` 会被非同步写污染，不能冒充。
- 价值：中（排查同步问题）。工作量：中（加 `last_synced_at` 列 + 同步流程写入 + migration）。
- 结论：**P2**。本轮 UI 不展示该列。

### 5. 管理员移除/停用 —— P0
- 设计稿：管理员表有红色「移除」操作。
- 现状：租户侧无任何管理员写端点（新增只能靠 owner claim）。
- 价值：高（owner 管理刚需）。工作量：小（`PATCH /admin/admins/:id {status}`，仅 owner，禁改自己、禁改 owner 行）。
- 结论：**P0 本轮实现**，语义为「停用/恢复」，不做物理删除（保留审计线索）。

### 6. 操作审计日志（时间/操作者/动作/目标/结果）—— P1
- 现状：同平台侧第 1 条，无表无数据。当前租户「审计」页实为企微回调事件流水。
- 价值：高。工作量：中-大。
- 结论：**P1**，与平台操作审计同表同迭代。本轮该页继续展示真实回调事件，页面标题与列名按实际数据标注，不冒充操作审计。

### 7. 资料完整度评分 —— P0
- 设计稿：企业主页顶部 80% 进度条 + 缺失项提示。
- 现状：无后端字段，但可由 profile bundle 确定性计算（名称/logo/介绍/服务/荣誉/视频是否配置）。
- 价值：中（引导完善资料）。工作量：小（前端纯计算，规则透明）。
- 结论：**P0 本轮前端实现**，计算规则写在代码注释中。

### 8. 平均停留时长 —— P1
- 现状：`card_visits` 无 duration 字段，需小程序端埋点上报。
- 价值：中。工作量：中（小程序埋点 + 上报接口 + 聚合）。
- 结论：**P1**，需小程序配合，列入小程序迭代。

### 9. 转化率 / 留资漏斗 —— P2
- 设计稿：曝光/访问/留资/转化四级漏斗 + 转化率 6.2%。
- 现状：无曝光与留资概念；有 `action_types` 可近似"互动"。
- 价值：中。工作量：中（需产品先定义"留资"action_type，再谈转化口径）。
- 结论：**P2**。本轮漏斗用真实三级（访问 → 互动 → 分享）替代并在页面注明口径。

### 10. 额度用量趋势（7/30 天切换）—— 拆分
- 访问趋势 30 天：`/admin/analytics` trend 写死 7 天，加 `days` 参数即可 —— **P0 本轮实现**（数据分析页 7/30 切换用真实访问数据）。
- 额度用量趋势：无 quota 时序快照，需定期快照机制 —— **P3 暂缓**，本轮版本页不展示该图。

---

## 三、鉴权现状与本轮方案

现状（代码核实）：

- 平台路由：`requirePlatformAdminRole` 显式校验 `accountType === "platform"`，租户 token 调平台接口返回 403。✅
- 租户路由：**只有角色等级校验（`requireAdminRole`），无 `accountType` 检查**。平台 token 可调用全部租户接口；数据范围被 token 内 `tenantId` 限制在平台 bootstrap 租户（"平台运营"），数据隔离事实上成立，但语义不严谨。
- `/admin/commercial`（租户版）service 层无角色检查，operator 也可读，与权限表（owner/admin/auditor）不符。
- 旧 token 无 `accountType` 字段，验证时缺省归为 `tenant`，向后兼容。

本轮方案：

1. 新增 `requireTenantAdminRole(session, required)`：校验 `accountType === "tenant"` 后走原角色等级比较。旧 token 缺省 tenant 不受影响。
2. 租户侧全部 controller（management/config/analytics/commercial/observability/company-video）统一替换为该校验。
3. `/admin/commercial` 补角色检查：拒绝 `operator`（对齐权限表）。
4. 前端已按登录响应 `account_type` 分流 system/enterprise 两种控制台模式，无需改动。
5. 联调验证：平台 token 调租户接口 403；租户 token 调平台接口 403；旧 token 租户功能正常。

---

## 附：本轮实施记录

后端已落地（测试 270 全绿）：

1. `GET /admin/members` 行扩展：`department`（名片加密字段真实值）、`title`、`mobile`、`email`、`card_status(none|active|disabled)`、`last_visit_at`（card_visits 聚合）。
2. `GET /admin/analytics?days=7|30`：趋势窗口可选。
3. `PATCH /admin/admins/:adminId {status}`：仅 owner，禁改自己、禁改 owner 行。
4. `requireTenantAdminRole` 覆盖全部租户端点；`/admin/commercial` 拒绝 operator（对齐权限表 owner/admin/auditor）。
5. 顺手修复数据丢失 bug：admin 名片保存的 `mergeFields/normalizeFields` 之前只保留 5 个字段——admin 保存会把员工自助填写的 `department/company/website` 等从加密 blob 抹掉，且 admin PATCH 这些字段（契约本就继承 employee 全量）被静默丢弃。已改为全量 overlay 合并并保留 blob 中的其它键，名片 GET 响应现在能返回全量字段。

## 附 2：操作审计日志落地（2026-07-17 第二轮）

P1 第一项「操作审计日志」已实施（测试 287 全绿）：

1. 新表 `admin_operation_logs`（migrate_v1_12）：tenant_id、actor（admin_id/open_userid/role/account_type）、action、target_type/target_id、detail_json、ip、created_at；`(tenant_id, created_at DESC)` 索引；无 FK、无 RLS（平台连接统一读写，RLS 会挡平台侧跨租户查询）。
2. 埋点 15 处（成功才记、日志失败不影响业务）：租户 member.card.update / member.sync / sync.retry / wecom.settings.update / company.profile.update|publish / company.honor.* / config.fields.update / template.* / admin.status.update；平台 platform.account.status.update / platform.tenant.sync / platform.quota.adjust / platform.video_feature.update / platform.audit.retry。平台动作带 tenantId 覆盖，平台侧可按目标租户筛选。
3. 端点：`GET /admin/operation-logs`（租户，owner/admin/auditor）、`GET /admin/platform/operation-logs`（平台，auditor+，可 tenant_id 过滤、含 tenant_name），均支持 action/search/limit/offset。
4. IP 经 AdminAuthGuard 挂入 session.requestIp；actor_name 列已预留（session 无 displayName，暂为 null）。
5. 未做：失败结果记录（需拦截器，后续）；request_id（无请求级 ID 基建，后续）。
