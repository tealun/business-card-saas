# 01_11 本地企业、成员邀请与外部连接器规格

版本: v1 · 日期: 2026-07-20 · 状态: 第一阶段实施中

## 1. 产品边界

标准企业版必须在不调用企业微信 API 的情况下完成：创建企业、企业管理员登录、成员添加/导入、成员微信绑定、企业内容与模板管理、名片生成/停用、访问统计和审计。企业微信是可选连接器，只增强自动身份识别、通讯录、工作台、消息和客户联系。

上游账号调用许可是单独成本与生命周期，不得与本平台 SaaS 权益混为一个状态。许可不足或连接取消时，关闭依赖企微接口的动作，但保留本地后台、成员、企业内容、名片和历史数据。

## 2. 身份与归属

- `accounts`: 自然人平台账号；微信 `openid/unionid` 只能证明自然人登录身份。
- `tenants`: 平台企业事实源，与企业微信是否授权无关。
- `member_identities`: 企业内成员档案；允许先创建、后绑定账号。
- `account_identity_bindings`: 自然人账号与某企业成员关系；同一自然人可绑定多家企业。
- 企业归属证明仅接受：一次性个人邀请、企业公共邀请后管理员审批、企业受控联系方式验证，或已授权企微返回的企业+成员身份。
- 企业公共二维码只创建 `pending` 申请，不得直接授予正式成员或管理员权限。

## 3. 目标数据模型

第一阶段兼容模型：`tenants.creation_source` 区分 `local/wecom/personal`，`open_corpid` 可空，`auth_status=unconnected` 表示未接连接器。

第二阶段新增：

- `tenant_connectors`: `tenant_id/provider/external_tenant_id/status/trial_expires_at`；企微凭据加密存储。
- `member_invitations`: 只存 token hash、目标成员、有效期、次数和撤销状态。
- `member_join_requests`: 公共邀请的待审批申请。
- `external_member_identities`: 连接器成员 ID 与本地成员的映射。

## 4. 核心流程

### 本地企业

owner 创建企业 → 创建/导入未绑定成员 → 发放一次性邀请 → 员工微信登录 → 消费邀请并绑定成员 → 创建/认领名片 → 管理员统一配置和停用。

### 后接企业微信

本地 owner 发起连接 → 企业管理员授权 → 根据明确认领信息关联既有 tenant → 通讯录预览 → 按员工号/受控联系方式/人工确认匹配 → 冲突不自动合并 → 启用增量同步。

## 5. 安全和验收

- 邀请 token 只存 SHA-256 hash，单次、可撤销、默认 24 小时过期。
- 租户权限只来自服务端会话，禁止以客户端 `tenant_id` 定权。
- 一名本地成员默认只能绑定一个 account；换绑需 owner 审批和审计。
- 同一 account 在同一企业默认只能绑定一个成员身份；数据库使用 `(tenant_id, account_id)` 唯一约束兜底。
- 邀请中的成员和名片保持非公开状态，只有一次性邀请成功消费后才激活。
- 本地企业管理员可使用已绑定的微信 account 换取新的后台会话；每个后台请求重新核验管理员状态与角色。
- 离职仅停用当前企业关系，不删除自然人账号或其他企业关系。
- 企微连接失效时，所有企微写操作明确失败，不得尝试用本地身份伪装企微身份。

## 5.1 第一阶段接口

- `POST /api/v1/local-enterprises`：员工微信会话创建本地企业并成为 owner，返回独立后台 token。
- `POST /api/v1/local-enterprises/admin-session`：员工微信会话按企业重新换取后台 token；仅绑定且启用的本地管理员可用。
- `POST /api/v1/admin/auth/local-scan/challenges`：网页创建 5 分钟一次性小程序登录挑战。
- `POST /api/v1/local-enterprises/admin-scan/confirm`：已登录微信账号确认挑战；多企业管理员必须选择企业。
- `GET /api/v1/admin/auth/local-scan/challenges/:token`：网页轮询并一次性消费已批准挑战，换取后台 token。
- `POST /api/v1/admin/local-enterprises/members/invitations`：owner/admin 预建员工和名片，返回 24 小时一次性邀请票据。
- `POST /api/v1/local-enterprises/invitations/accept`：已登录微信账号消费票据并绑定预建成员。
- `POST /api/v1/admin/local-enterprises/join-code`：轮换生成 30 天企业公共加入码。
- `POST /api/v1/local-enterprises/join-requests`：微信账号扫码后只提交待审批申请。
- `GET /api/v1/admin/local-enterprises/join-requests`、`POST .../:id/review`：企业管理员查看并批准/拒绝；仅批准时创建成员、名片和账号绑定。

邀请查找发生在租户上下文建立前，因此 `member_invitations` 只保存 SHA-256 token hash 和最小绑定元数据，使用行锁原子消费；不得记录或查询明文 token。

企业创建按 account 串行化，单账号最多拥有 3 个本地企业，并施加独立低频限流。邀请、加入码轮换和申请审批写入管理员操作日志。

企业后台默认使用普通微信小程序扫码登录；企业微信扫码仅作为已连接企微租户的次级入口。浏览器挑战只保存 token hash，5 分钟过期，批准后只能换取一次后台会话，换取时再次验证账号绑定和管理员启用状态。

## 6. 账号调用许可 M0

正式定价前必须保存：服务商后台当前价格与分类截图、90 天试用规则、核心接口对应许可类型、许可不足/到期错误码、激活/转移/回收流程、真实订单或测试证据。未完成时，企微增强版不得标记为可正式销售。
