# 微信小程序 + 企业微信第三方应用 + 多租户企业名片 SaaS 开发文档

版本：v0.2  
日期：2026-07-01  
文档定位：产品技术方案 / 架构设计草案 / 研发启动文档  
适用对象：产品负责人、技术负责人、后端、前端、小程序、测试、运维、企业微信服务商配置人员

---

## 0. 一句话结论

本项目建议定义为：

> 一个以微信小程序为主要名片分发载体、以企业微信第三方应用为企业授权与员工身份增强层、以多租户后台为企业管理平台的企业名片 SaaS。

核心判断：

1. **微信小程序是主入口和主分享载体**：员工可以用微信分享名片，客户可以在微信中直接打开。
2. **企业微信是增强层，不是唯一闭环**：企业微信负责企业授权、员工身份识别、客户联系、欢迎语、客户关系映射、接口许可管理。
3. **客户不强制添加企业微信**：客户可以直接保存电话、拨打电话、查看案例、保存海报；“添加企业微信”只是可选增强动作。
4. **自然人账号与企业员工身份分离**：一个人可以属于多家企业，每个企业身份拥有独立名片。
5. **所有企业数据必须多租户隔离**：企业管理员只能看到自己企业的数据，即使系统内部知道同一自然人绑定了多家企业，也不得跨企业展示。

---

## 1. 产品目标

### 1.1 要解决的问题

企业员工需要一种轻量、统一、可管理的电子名片工具，用于在微信、企业微信、微信群、客户沟通场景中分发个人联系方式与企业信息。

传统纸质名片存在以下问题：

- 更新成本高，职位、电话、公司资料变更后难以同步。
- 传播路径弱，无法统计客户是否查看、保存、拨打、加企微。
- 品牌统一性差，员工个人制作名片容易视觉不一致。
- 客户动作单一，纸质名片无法直接跳转案例、官网、地图、预约、企业微信。

本系统要提供：

- 企业统一配置品牌模板。
- 员工拥有自己的电子名片。
- 员工可以在微信和企业微信中分享。
- 客户可以直接保存电话、拨打电话、查看资料。
- 客户可选添加企业微信。
- 企业可选打通客户联系、欢迎语、external_userid 映射和 CRM 追踪。

### 1.2 产品边界

第一阶段重点做“企业电子名片分发”，不是一开始就做完整 CRM。

第一阶段包含：

- 小程序名片详情页。
- 员工名片管理。
- 企业品牌模板。
- 小程序分享。
- 保存到通讯录。
- 拨打电话。
- 名片海报。
- 基础访问统计。
- 企业微信第三方应用授权与员工身份识别。
- 一人多企业身份切换。

第二阶段增强：

- 企业微信客户联系“联系我”。
- 新客户欢迎语。
- unionid / external_userid 映射。
- pending_id 后续关联。
- 客户来源追踪。
- 接口调用许可管理。

第三阶段再考虑：

- 纸质名片 OCR。
- 客户名片夹。
- 跟进记录。
- 客户标签。
- CRM 对接。
- 销售线索分配。

---

## 2. 角色定义

### 2.1 平台方 / 服务商

即本系统运营方。负责：

- 维护微信小程序主体。
- 维护企业微信第三方应用。
- 维护多租户 SaaS 后台。
- 接收企业授权。
- 管理接口调用许可。
- 保障租户数据隔离。

### 2.2 企业租户

即购买或授权使用本系统的企业。每个企业租户对应一条 tenant 数据。

企业租户可以：

- 授权第三方应用。
- 设置应用可见范围。
- 配置名片字段规则。
- 配置品牌模板。
- 管理员工名片。
- 查看本企业统计数据。

### 2.3 企业管理员

企业管理员负责本企业配置与审核。

可操作：

- 查看本企业员工。
- 启用或停用员工名片。
- 设置模板。
- 设置哪些字段允许员工编辑。
- 设置手机号、邮箱、个人微信、企业微信二维码等字段的展示规则。
- 查看访问统计。
- 配置客户联系能力。

### 2.4 员工

员工是名片拥有者。一个自然人可能拥有多个企业员工身份。

例如：

- 张三 / A 公司 / 品牌顾问。
- 张三 / B 公司 / 合伙人。
- 张三 / C 协会 / 理事。

员工可以：

- 打开自己的名片。
- 编辑允许编辑的字段。
- 选择当前企业身份。
- 分享指定企业名片。
- 生成名片海报。
- 查看自己的访问数据。

### 2.5 客户 / 访客

客户可能只是微信用户，不一定是企业微信客户。

客户可以：

- 查看名片。
- 保存到通讯录。
- 拨打电话。
- 复制电话或邮箱。
- 查看公司官网、案例、地图、预约链接。
- 可选添加企业微信。
- 可选授权微信身份，用于更准确的客户追踪。

---

## 3. 总体架构

```text
微信小程序
  ├─ 员工端
  ├─ 客户端
  └─ 企业微信环境兼容层 wx.qy.*

企业微信第三方应用
  ├─ 企业授权
  ├─ 成员身份识别
  ├─ 客户联系权限
  ├─ 欢迎语能力
  ├─ external_userid 映射
  └─ 接口调用许可

SaaS 后端
  ├─ Auth Service
  ├─ Tenant Service
  ├─ Member Identity Service
  ├─ Card Service
  ├─ Template Service
  ├─ Contact Way Service
  ├─ Customer Mapping Service
  ├─ Stats Service
  ├─ License Service
  ├─ Callback Service
  └─ Admin API

基础设施
  ├─ MySQL / PostgreSQL
  ├─ Redis
  ├─ 对象存储 OSS / COS / S3
  ├─ 消息队列
  ├─ 日志系统
  ├─ 监控告警
  └─ CDN
```

### 3.1 推荐技术栈

后端：

- Node.js NestJS / Java Spring Boot / Go / Python FastAPI 均可。
- 不绑定特定语言，核心是服务分层清晰。

数据库：

- MySQL 8 或 PostgreSQL。
- 强烈建议所有业务表带 tenant_id。

缓存：

- Redis。
- 用于缓存 suite_access_token、provider_access_token、企业 access_token、jsapi_ticket、短期登录态、限流计数。

对象存储：

- 存储头像、Logo、模板背景、名片海报、分享封面图。

消息队列：

- 处理通讯录同步、海报生成、统计聚合、客户映射重试、回调异步任务。

---

## 4. 核心设计原则

### 4.1 微信优先，企业微信增强

不要把客户体验绑死在企业微信上。

正确体验：

```text
客户微信收到名片
→ 打开小程序
→ 查看名片
→ 保存电话 / 拨打电话
→ 可选添加企业微信
```

不要设计成：

```text
客户打开名片
→ 必须授权
→ 必须加企业微信
→ 才能看联系方式
```

这样会降低转化。

### 4.2 人可以打通，企业身份必须隔离

同一个自然人可以拥有多家企业身份，但每个企业身份独立。

```text
account：自然人账号
  ├─ member_identity：A 企业身份
  │    └─ card：A 企业名片
  ├─ member_identity：B 企业身份
  │    └─ card：B 企业名片
  └─ member_identity：C 组织身份
       └─ card：C 组织名片
```

不要把名片直接挂在自然人账号上。名片必须挂在企业身份上。

### 4.3 所有客户关系按企业隔离

同一个微信客户可能同时是 A 企业客户和 B 企业客户。

```text
visitor_account：微信访客
  ├─ A 企业 external_userid
  └─ B 企业 external_userid
```

A 企业不能看到客户在 B 企业的关系数据。

### 4.4 不自动合并身份

禁止仅凭姓名、手机号、邮箱自动合并自然人身份。

允许：

- 同一微信 unionid 主动确认绑定。
- 手机号短信验证后主动确认绑定。

不允许：

- 姓名相同自动合并。
- 邮箱相同自动合并。
- 通讯录字段相似自动合并。

---

## 5. 身份模型

### 5.1 身份类型

系统需要同时处理五种身份：

1. 平台自然人账号 account。
2. 企业租户 tenant。
3. 企业员工身份 member_identity。
4. 企业名片 card。
5. 客户访客 visitor_account / tenant_external_customer。

### 5.2 自然人账号 account

代表平台中“这个人”。通常由微信 unionid 识别。

```text
accounts
- id
- wx_unionid
- primary_wx_openid
- nickname
- avatar
- phone_hash
- status
- created_at
- updated_at
```

### 5.3 企业租户 tenant

代表一个授权企业。

```text
tenants
- id
- open_corpid
- corp_name
- suite_id
- permanent_code_encrypted
- auth_status
- auth_time
- cancel_auth_time
- created_at
- updated_at
```

注意：

- permanent_code 必须加密存储。
- open_corpid / corp_id 以企业微信第三方应用实际返回为准。
- 不同企业的数据必须完全隔离。

### 5.4 企业员工身份 member_identity

代表某人在某企业里的员工身份。

```text
member_identities
- id
- tenant_id
- open_corpid
- userid
- open_userid
- name
- avatar
- department_json
- position
- mobile_encrypted
- email_encrypted
- status
- license_type
- created_at
- updated_at
```

唯一键建议：

```text
UNIQUE(tenant_id, userid)
UNIQUE(tenant_id, open_userid)
```

### 5.5 自然人与企业身份绑定

这是“一人多企业”的关键。

```text
account_identity_bindings
- id
- account_id
- tenant_id
- member_identity_id
- bind_method
- verified_at
- is_default
- last_used_at
- created_at
```

一个 account 可以绑定多个 member_identity。

### 5.6 名片 card

名片属于企业身份，不直接属于自然人。

```text
cards
- id
- tenant_id
- member_identity_id
- slug
- display_name
- title
- phone_encrypted
- email_encrypted
- wechat_id_encrypted
- intro
- tags_json
- links_json
- template_id
- privacy_json
- contact_way_config_id
- status
- created_at
- updated_at
```

唯一键建议：

```text
UNIQUE(tenant_id, slug)
UNIQUE(member_identity_id)
```

### 5.7 客户访客 visitor_account

代表微信侧访客。

```text
visitor_accounts
- id
- wx_openid
- wx_unionid
- nickname
- avatar
- created_at
- updated_at
```

### 5.8 企业外部联系人映射

代表某个微信访客在某个企业下对应的 external_userid 或 pending_id。

```text
tenant_external_customers
- id
- tenant_id
- visitor_account_id
- external_userid
- pending_id
- source_card_id
- source_member_identity_id
- status
- mapped_at
- created_at
- updated_at
```

唯一键建议：

```text
UNIQUE(tenant_id, external_userid)
UNIQUE(tenant_id, pending_id)
```

---

## 6. 员工使用流程

### 6.1 员工从企业微信打开

```text
员工在企业微信工作台打开小程序
→ 小程序判断当前环境为企业微信
→ 调用 wx.qy.login
→ 后端换取企业成员身份
→ 定位 tenant + member_identity
→ 若没有名片则自动创建默认名片
→ 若没有绑定 account，则提示绑定微信账号
→ 进入“我的名片”
```

默认身份规则：

- 从 A 企业微信打开，就默认 A 企业身份。
- 即使用户在微信侧默认身份是 B 企业，也不能覆盖企业微信当前上下文。

### 6.2 员工从普通微信打开

```text
员工在微信打开小程序
→ 调用 wx.login
→ 后端获取 openid / unionid
→ 查找 account
→ 查询绑定的所有 member_identity
→ 如果只有一个身份，直接进入该身份名片
→ 如果有多个身份，显示身份选择器
```

身份选择器示例：

```text
请选择要使用的名片：

[桂林某某品牌设计有限公司]
张三｜品牌顾问

[深圳某某科技有限公司]
张三｜联合创始人

[某某行业协会]
张三｜理事
```

### 6.3 员工分享名片

分享必须指向具体 card。

正确：

```text
/pages/card/detail?card=8k3h29&from=identity_1024&channel=wx_session
```

错误：

```text
/pages/card/detail?account=1001
```

原因：一个自然人可能有多张名片，客户打开后不能猜。

---

## 7. 客户访问流程

### 7.1 匿名访问

```text
客户打开小程序名片
→ 不强制登录
→ 展示公开字段
→ 记录匿名访问
```

可用动作：

- 保存到通讯录。
- 拨打电话。
- 复制电话。
- 复制邮箱。
- 查看官网。
- 查看案例。
- 导航。
- 保存海报。
- 分享名片。

### 7.2 授权微信身份后访问

```text
客户点击需要身份的动作，例如收藏、留言、预约
→ 请求微信授权
→ 获取 openid / unionid
→ 创建 visitor_account
→ 记录访问与动作
```

注意：查看名片和保存电话不应强制授权。

### 7.3 可选添加企业微信

```text
客户点击“添加企业微信”
→ 显示该员工对应的联系我二维码或按钮
→ 客户主动添加
→ 企业微信推送添加客户事件
→ 后端处理回调
→ 可发送欢迎语
→ 尝试建立 external_userid 映射
```

---

## 8. 企业微信第三方应用接入

### 8.1 服务商侧准备

需要准备：

- 企业微信服务商账号。
- 第三方应用。
- 微信小程序主体。
- 小程序与第三方应用关联。
- 回调 URL。
- Token。
- EncodingAESKey。
- SuiteID。
- SuiteSecret。
- 权限范围配置。

### 8.2 企业授权流程

```text
企业管理员进入授权链接
→ 确认授权第三方应用
→ 选择可见范围
→ 企业微信回调授权事件
→ 平台获取 auth_code
→ 平台换取 permanent_code
→ 创建 tenant
→ 保存授权应用信息
→ 初始化企业配置
```

保存内容：

- open_corpid。
- corp_name。
- permanent_code_encrypted。
- agent_id。
- 权限范围。
- 可见成员 / 部门。
- 授权状态。

### 8.3 Token 缓存

需要缓存：

- suite_access_token。
- provider_access_token。
- 企业 access_token。
- jsapi_ticket。
- agent_jsapi_ticket。

缓存策略：

- Redis 保存。
- 过期前提前刷新。
- 刷新失败时保留旧 token 短时间兜底。
- 不允许把 access_token 返回给小程序前端。

### 8.4 回调事件

需要处理：

- 授权成功。
- 授权变更。
- 取消授权。
- 通讯录成员变更。
- 客户添加事件。
- 客户删除事件。
- 欢迎语事件。

回调安全要求：

- 校验签名。
- 解密消息。
- 幂等处理。
- 快速返回。
- 耗时逻辑放入队列。

---

## 9. 客户联系能力设计

### 9.1 联系我配置

每个员工可以有一个或多个联系我配置。

```text
contact_ways
- id
- tenant_id
- member_identity_id
- config_id
- qr_code
- state
- type
- scene
- is_temp
- expires_at
- status
- created_at
- updated_at
```

使用场景：

- 名片详情页添加企业微信。
- 名片海报二维码。
- 客户添加后欢迎语来源追踪。

### 9.2 state 设计

state 用于追踪来源。

建议结构：

```text
card:{card_id}:member:{member_identity_id}:channel:{channel}:nonce:{random}
```

存储映射：

```text
contact_way_states
- id
- tenant_id
- state
- card_id
- member_identity_id
- channel
- scene
- expires_at
- created_at
```

### 9.3 没有客户联系权限时

如果企业未授权客户联系权限，或员工没有互通许可：

- 隐藏“添加企业微信”按钮。
- 保留保存电话、拨打电话、复制邮箱、查看官网等基础动作。
- 后台提示企业管理员开通增强能力。

---

## 10. unionid / external_userid 映射

### 10.1 映射目标

当客户在微信小程序打开名片，并且系统获取到客户 unionid 后，可以尝试在当前企业租户下映射 external_userid。

结果可能有三种：

1. 返回 external_userid：说明客户已经是该企业的外部联系人。
2. 返回 pending_id：说明暂时不是客户，后续添加企业微信后可关联。
3. 无法映射：缺少权限、缺少 unionid、企业未认证、未授权客户联系能力等。

### 10.2 映射原则

- external_userid 必须按 tenant_id 存储。
- 不允许跨企业复用 external_userid。
- pending_id 也必须按 tenant_id 存储。
- 映射失败不影响客户查看名片。

### 10.3 映射流程

```text
客户打开 A 企业员工名片
→ 小程序获取客户 openid / unionid
→ 后端创建 visitor_account
→ 判断 A 企业是否具备客户联系权限
→ 调用 unionid 转 external_userid 接口
→ 如果返回 external_userid，保存到 tenant_external_customers
→ 如果返回 pending_id，保存 pending 状态
→ 如果失败，仅记录日志
```

### 10.4 同一客户访问多个企业名片

```text
visitor_account_9001
  ├─ tenant_A external_userid_A
  └─ tenant_B external_userid_B
```

平台可在内部知道是同一个微信访客，但企业后台只能看到本企业下的数据。

---

## 11. 名片详情页设计

### 11.1 信息结构

第一屏：

- 头像。
- 姓名。
- 职位。
- 公司名。
- 部门。
- 品牌背景。
- 核心标签。

主操作：

- 保存到通讯录。
- 拨打电话。

辅助操作：

- 复制电话。
- 复制邮箱。
- 查看官网。
- 查看案例。
- 导航到公司。
- 添加企业微信。
- 保存海报。
- 转发名片。

### 11.2 按钮优先级

推荐顺序：

```text
[保存到通讯录] [拨打电话]
添加企业微信
查看案例 / 官网 / 导航 / 保存海报
```

原因：

- 客户收到名片时，最自然的动作是保存联系方式。
- 不要把“加企业微信”做成唯一目标。
- 先满足客户的轻量需求，再温和引导建立企业微信关系。

### 11.3 字段隐私

每张名片有 privacy_json：

```json
{
  "show_mobile": true,
  "show_email": true,
  "show_wechat_id": false,
  "show_wecom_contact": true,
  "show_address": true
}
```

企业管理员可以设置全局规则：

- 是否允许展示手机号。
- 是否允许展示个人微信。
- 是否允许员工自定义头像。
- 是否需要审核后发布。
- 是否允许外部访问名片。

---

## 12. 小程序页面规划

### 12.1 员工端页面

```text
/pages/employee/index
我的名片首页

/pages/employee/identity-switch
身份切换

/pages/employee/edit
编辑名片

/pages/employee/share
分享名片

/pages/employee/poster
名片海报

/pages/employee/stats
访问统计

/pages/employee/bind
绑定微信账号
```

### 12.2 客户端页面

```text
/pages/card/detail
名片详情

/pages/card/poster
名片海报

/pages/card/company
公司介绍

/pages/card/cases
案例列表

/pages/card/contact
添加企业微信 / 联系我
```

### 12.3 管理端页面

管理端建议使用 Web 后台，而不是强行塞进小程序。

```text
/admin/login
管理员登录

/admin/dashboard
数据看板

/admin/tenants
租户管理，平台方可见

/admin/members
员工管理

/admin/cards
名片管理

/admin/templates
模板管理

/admin/fields
字段规则

/admin/contact-way
客户联系配置

/admin/licenses
接口许可管理

/admin/audit-logs
操作日志
```

---

## 13. 后端模块设计

### 13.1 Auth Service

负责：

- 微信小程序 wx.login 登录。
- 企业微信 wx.qy.login 登录。
- session_key 处理。
- account 创建与绑定。
- 登录态签发。
- 身份切换。

### 13.2 Tenant Service

负责：

- 企业授权。
- permanent_code 加密保存。
- 企业状态管理。
- 企业配置初始化。
- 授权变更处理。

### 13.3 Member Identity Service

负责：

- 成员身份识别。
- 通讯录同步。
- 一人多企业身份绑定。
- 离职状态处理。
- 员工许可状态维护。

### 13.4 Card Service

负责：

- 创建默认名片。
- 编辑名片。
- 字段权限校验。
- 名片公开访问。
- slug 生成。
- 名片状态管理。

### 13.5 Template Service

负责：

- 企业品牌模板。
- 部门模板。
- 默认模板。
- Logo / 色彩 / 背景图。

### 13.6 Contact Way Service

负责：

- 生成联系我配置。
- 保存 config_id。
- 维护二维码。
- 处理 state。
- 判断客户联系权限。

### 13.7 Customer Mapping Service

负责：

- visitor_account 创建。
- unionid / external_userid 映射。
- pending_id 保存。
- 客户添加后关联。
- 客户来源追踪。

### 13.8 Stats Service

负责：

- 访问记录。
- 动作记录。
- 分享记录。
- 员工统计。
- 企业统计。
- 数据聚合。

### 13.9 License Service

负责：

- 基础账号。
- 互通账号。
- 员工许可状态。
- 套餐能力判断。
- 到期提醒。

### 13.10 Callback Service

负责：

- 企业微信回调验签。
- 消息解密。
- 事件路由。
- 幂等处理。
- 异步队列投递。

---

## 14. API 草案

### 14.1 登录相关

```text
POST /api/auth/wx-login
普通微信小程序登录

POST /api/auth/qy-login
企业微信小程序登录

POST /api/auth/bind-account
绑定自然人账号与企业员工身份

GET /api/auth/identities
获取当前 account 绑定的企业身份列表

POST /api/auth/switch-identity
切换当前企业身份
```

### 14.2 员工名片

```text
GET /api/employee/cards/current
获取当前身份名片

PUT /api/employee/cards/current
更新当前身份名片

POST /api/employee/cards/current/poster
生成名片海报

GET /api/employee/cards/current/stats
查看当前名片统计
```

### 14.3 客户访问

```text
GET /api/public/cards/{slug}
公开读取名片

POST /api/public/cards/{slug}/visit
记录访问

POST /api/public/cards/{slug}/actions
记录动作，例如 save_phone、call_phone、copy_email、add_wecom

GET /api/public/cards/{slug}/vcard
生成通讯录 vCard
```

### 14.4 客户联系

```text
GET /api/contact-way/cards/{card_id}
获取该名片的联系我配置

POST /api/contact-way/cards/{card_id}/refresh
刷新联系我二维码

POST /api/customer-mapping/map
尝试 unionid / external_userid 映射
```

### 14.5 企业后台

```text
GET /api/admin/members
员工列表

GET /api/admin/cards
名片列表

PUT /api/admin/cards/{id}/status
启用 / 停用名片

GET /api/admin/templates
模板列表

POST /api/admin/templates
创建模板

PUT /api/admin/settings/fields
更新字段规则

GET /api/admin/stats/overview
企业统计概览
```

---

## 15. 数据库核心表 DDL 草案

以下为草案，实际开发时根据数据库类型调整字段类型。

```sql
CREATE TABLE accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  wx_unionid VARCHAR(128) NULL,
  primary_wx_openid VARCHAR(128) NULL,
  nickname VARCHAR(128) NULL,
  avatar TEXT NULL,
  phone_hash VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_accounts_unionid (wx_unionid)
);
```

```sql
CREATE TABLE tenants (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  open_corpid VARCHAR(128) NOT NULL,
  corp_name VARCHAR(255) NULL,
  suite_id VARCHAR(128) NOT NULL,
  permanent_code_encrypted TEXT NOT NULL,
  auth_status VARCHAR(32) NOT NULL DEFAULT 'active',
  auth_time DATETIME NULL,
  cancel_auth_time DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_tenants_open_corpid (open_corpid)
);
```

```sql
CREATE TABLE member_identities (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  open_corpid VARCHAR(128) NOT NULL,
  userid VARCHAR(128) NULL,
  open_userid VARCHAR(128) NULL,
  name VARCHAR(128) NULL,
  avatar TEXT NULL,
  department_json JSON NULL,
  position VARCHAR(128) NULL,
  mobile_encrypted TEXT NULL,
  email_encrypted TEXT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  license_type VARCHAR(32) NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_member_tenant (tenant_id),
  UNIQUE KEY uk_member_userid (tenant_id, userid),
  UNIQUE KEY uk_member_open_userid (tenant_id, open_userid)
);
```

```sql
CREATE TABLE account_identity_bindings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  account_id BIGINT NOT NULL,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  bind_method VARCHAR(32) NOT NULL,
  verified_at DATETIME NULL,
  is_default TINYINT NOT NULL DEFAULT 0,
  last_used_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  UNIQUE KEY uk_account_identity (account_id, member_identity_id),
  KEY idx_binding_account (account_id),
  KEY idx_binding_tenant (tenant_id)
);
```

```sql
CREATE TABLE cards (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  slug VARCHAR(64) NOT NULL,
  display_name VARCHAR(128) NULL,
  title VARCHAR(128) NULL,
  phone_encrypted TEXT NULL,
  email_encrypted TEXT NULL,
  wechat_id_encrypted TEXT NULL,
  intro TEXT NULL,
  tags_json JSON NULL,
  links_json JSON NULL,
  template_id BIGINT NULL,
  privacy_json JSON NULL,
  contact_way_config_id VARCHAR(128) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_cards_slug (tenant_id, slug),
  UNIQUE KEY uk_cards_identity (member_identity_id),
  KEY idx_cards_tenant (tenant_id)
);
```

```sql
CREATE TABLE visitor_accounts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  wx_openid VARCHAR(128) NULL,
  wx_unionid VARCHAR(128) NULL,
  nickname VARCHAR(128) NULL,
  avatar TEXT NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  KEY idx_visitor_unionid (wx_unionid),
  KEY idx_visitor_openid (wx_openid)
);
```

```sql
CREATE TABLE tenant_external_customers (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  visitor_account_id BIGINT NULL,
  external_userid VARCHAR(128) NULL,
  pending_id VARCHAR(128) NULL,
  source_card_id BIGINT NULL,
  source_member_identity_id BIGINT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  mapped_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  UNIQUE KEY uk_external_user (tenant_id, external_userid),
  UNIQUE KEY uk_pending_id (tenant_id, pending_id),
  KEY idx_external_visitor (visitor_account_id)
);
```

```sql
CREATE TABLE card_visits (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  visitor_account_id BIGINT NULL,
  external_userid VARCHAR(128) NULL,
  pending_id VARCHAR(128) NULL,
  channel VARCHAR(64) NULL,
  scene VARCHAR(64) NULL,
  user_agent TEXT NULL,
  ip_hash VARCHAR(128) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_visit_card (tenant_id, card_id),
  KEY idx_visit_member (tenant_id, member_identity_id),
  KEY idx_visit_created (created_at)
);
```

```sql
CREATE TABLE card_actions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  card_id BIGINT NOT NULL,
  member_identity_id BIGINT NOT NULL,
  visitor_account_id BIGINT NULL,
  action_type VARCHAR(64) NOT NULL,
  external_userid VARCHAR(128) NULL,
  pending_id VARCHAR(128) NULL,
  channel VARCHAR(64) NULL,
  scene VARCHAR(64) NULL,
  created_at DATETIME NOT NULL,
  KEY idx_action_card (tenant_id, card_id),
  KEY idx_action_type (tenant_id, action_type),
  KEY idx_action_created (created_at)
);
```

---

## 16. 权限与数据隔离

### 16.1 多租户访问控制

所有后台查询必须带 tenant_id。

```text
WHERE tenant_id = 当前管理员所属企业
```

禁止：

- 通过 account_id 查询跨企业身份后展示给企业管理员。
- 给企业管理员显示员工绑定了哪些其他企业。
- 给企业管理员显示同一客户在其他企业的访问数据。

### 16.2 平台管理员权限

平台管理员可以查看租户列表和系统运维信息，但也应分级：

- 超级管理员。
- 客服运营。
- 技术运维。
- 只读审计。

敏感数据默认脱敏。

### 16.3 员工权限

员工只能管理自己绑定的企业身份名片。

员工在 A 企业身份下不能编辑 B 企业名片。

### 16.4 客户隐私

客户不登录也能查看公开名片。

客户授权后记录 openid / unionid，但需要：

- 明示授权用途。
- 可删除或匿名化数据。
- 不把客户跨企业关系暴露给任一企业。

---

## 17. 安全设计

### 17.1 密钥管理

必须加密保存：

- permanent_code。
- suite_secret。
- 企业 access_token 不落库，只缓存。
- 手机号。
- 邮箱。
- 个人微信号。

建议：

- 使用 KMS 或应用层加密。
- 密钥分环境管理。
- 禁止提交到 GitHub。

### 17.2 回调安全

企业微信回调必须：

- 校验 msg_signature。
- 校验 timestamp / nonce。
- 解密消息。
- 幂等处理。
- 记录回调日志。
- 异常告警。

### 17.3 接口安全

- 后端接口统一鉴权。
- 管理后台接口校验 tenant_id。
- 公共名片接口只返回公开字段。
- 限流防刷。
- 分享 slug 不使用自增 ID。
- 上传文件校验类型和大小。
- 海报生成防止 SSRF。

### 17.4 日志脱敏

日志不得明文输出：

- access_token。
- permanent_code。
- 手机号。
- 邮箱。
- 微信号。
- external_userid 全量值。

---

## 18. 接口调用许可与套餐分层

建议产品套餐拆成三层。

### 18.1 名片基础版

能力：

- 小程序名片。
- 分享名片。
- 保存电话。
- 拨打电话。
- 名片海报。
- 基础访问统计。

不依赖客户联系权限。

### 18.2 企业微信员工版

能力：

- 企业授权。
- 企业微信工作台入口。
- 企业微信员工身份识别。
- 员工资料同步。
- 企业后台管理。

需要关注基础账号 / 接口调用许可。

### 18.3 客户联系增强版

能力：

- 添加企业微信。
- 联系我二维码。
- 新客户欢迎语。
- unionid / external_userid 映射。
- pending_id 追踪。
- 客户来源统计。

需要关注互通账号 / 客户联系权限。

---

## 19. 开发里程碑

### M1：小程序名片基础能力

目标：先证明名片分发价值。

包含：

- 小程序名片详情页。
- 员工名片编辑。
- 名片模板。
- 保存到通讯录。
- 拨打电话。
- 小程序分享。
- 名片海报。
- 基础访问统计。

验收：

- 员工可以生成一张名片。
- 客户可以微信打开名片。
- 客户可以保存电话。
- 员工可以转发小程序卡片。

### M2：多租户与一人多企业

目标：让系统具备 SaaS 基础。

包含：

- tenant 模型。
- account 模型。
- member_identity 模型。
- account_identity_binding。
- 身份选择器。
- 企业后台基础版。
- tenant_id 数据隔离。

验收：

- 同一个微信账号可绑定 A / B 两个企业身份。
- 分享 A 名片只显示 A 企业信息。
- 分享 B 名片只显示 B 企业信息。
- A 企业管理员看不到 B 企业信息。

### M3：企业微信第三方应用

目标：打通企业授权和员工身份。

包含：

- 第三方应用配置。
- 企业授权流程。
- permanent_code 保存。
- access_token 管理。
- wx.qy.login。
- 企业微信工作台入口。
- 通讯录同步。
- 授权取消处理。

验收：

- 企业可以授权应用。
- 员工从企业微信打开能自动识别。
- 新员工可自动生成默认名片。
- 取消授权后企业能力暂停。

### M4：客户联系增强

目标：打通企业微信客户链路。

包含：

- 联系我二维码。
- 添加企业微信按钮。
- 客户添加回调。
- 新客户欢迎语。
- unionid / external_userid 映射。
- pending_id 关联。
- 客户来源统计。

验收：

- 客户可以从名片添加企业微信。
- 添加后可以收到欢迎语。
- 系统能记录客户来源名片。
- 能区分 external_userid 与 pending_id。

### M5：CRM 增强

目标：向名片全能王 / 轻 CRM 靠近。

包含：

- 客户名片夹。
- 纸质名片 OCR。
- 客户标签。
- 跟进记录。
- 线索导出。
- 销售看板。

---

## 20. 测试计划

### 20.1 功能测试

- 员工创建名片。
- 员工编辑字段。
- 企业字段规则限制。
- 小程序分享。
- 保存到通讯录。
- 拨打电话。
- 名片海报生成。
- 多身份切换。
- 企业后台启用 / 停用名片。

### 20.2 企业微信测试

- 企业授权成功。
- 企业取消授权。
- wx.qy.login 成功。
- 员工不在可见范围内。
- access_token 过期刷新。
- 通讯录同步。
- 客户联系权限缺失。
- 接口调用许可缺失。

### 20.3 多租户测试

- A 企业管理员不能访问 B 企业员工。
- A 企业名片不能使用 B 企业模板。
- 同一自然人绑定多企业身份。
- 同一客户访问多个企业名片。
- external_userid 按 tenant 隔离。

### 20.4 安全测试

- slug 枚举防护。
- 越权访问测试。
- 回调签名伪造测试。
- 上传文件安全测试。
- 敏感字段脱敏测试。
- 日志敏感信息泄露测试。

### 20.5 性能测试

- 名片详情页高并发访问。
- 海报生成并发。
- 回调队列堆积。
- 统计写入压力。
- token 刷新竞争。

---

## 21. GitHub Issue 拆分建议

### Epic 1：小程序名片基础能力

- [ ] 搭建小程序项目结构。
- [ ] 实现名片详情页。
- [ ] 实现保存通讯录。
- [ ] 实现拨打电话。
- [ ] 实现小程序分享参数。
- [ ] 实现名片海报生成。
- [ ] 实现访问与动作埋点。

### Epic 2：多租户与身份模型

- [ ] 设计 tenant 表。
- [ ] 设计 account 表。
- [ ] 设计 member_identity 表。
- [ ] 设计 account_identity_binding 表。
- [ ] 实现身份选择器。
- [ ] 实现 tenant_id 权限中间件。
- [ ] 编写越权访问测试。

### Epic 3：企业微信第三方应用

- [ ] 配置服务商第三方应用。
- [ ] 实现授权回调。
- [ ] 实现 permanent_code 加密保存。
- [ ] 实现企业 access_token 缓存。
- [ ] 实现 wx.qy.login 后端换取身份。
- [ ] 实现通讯录同步任务。
- [ ] 实现取消授权处理。

### Epic 4：客户联系增强

- [ ] 实现联系我配置生成。
- [ ] 实现名片添加企业微信按钮。
- [ ] 实现客户添加回调。
- [ ] 实现欢迎语发送。
- [ ] 实现 unionid / external_userid 映射。
- [ ] 实现 pending_id 保存和后续关联。
- [ ] 实现客户来源统计。

### Epic 5：后台管理

- [ ] 实现企业后台登录。
- [ ] 实现员工列表。
- [ ] 实现名片列表。
- [ ] 实现模板管理。
- [ ] 实现字段规则管理。
- [ ] 实现统计看板。
- [ ] 实现接口许可状态展示。

---

## 22. 风险清单

### 22.1 权限风险

企业微信权限复杂，不同企业的认证状态、客户联系权限、接口调用许可不同。

应对：

- 能力分层。
- 缺权限时降级。
- 基础名片功能不依赖客户联系。

### 22.2 客户体验风险

如果强制客户授权或添加企业微信，会降低使用率。

应对：

- 查看名片不强制授权。
- 保存电话为主按钮。
- 添加企业微信作为可选动作。

### 22.3 多身份混乱风险

一个人多个企业身份，如果设计不清晰，会导致分享错名片。

应对：

- 分享路径必须携带 card_id。
- 小程序首页提供身份选择器。
- 企业微信上下文优先当前企业身份。

### 22.4 数据串租户风险

多租户 SaaS 最大风险是数据串租户。

应对：

- 所有业务表带 tenant_id。
- 所有管理端查询强制 tenant_id。
- 编写自动化越权测试。
- 日志审计。

### 22.5 敏感信息风险

手机号、邮箱、微信号、客户 external_userid 都属于敏感数据。

应对：

- 加密存储。
- 展示开关。
- 日志脱敏。
- 员工确认后展示。

---

## 23. MVP 验收清单

MVP 达成时，应满足：

- [ ] 企业可以授权成为租户。
- [ ] 员工从企业微信打开小程序可以识别身份。
- [ ] 员工从微信打开小程序可以选择已绑定身份。
- [ ] 一个自然人可以绑定多个企业身份。
- [ ] 每个企业身份拥有独立名片。
- [ ] 员工可以分享指定名片。
- [ ] 客户可以微信打开名片。
- [ ] 客户不登录也能查看公开字段。
- [ ] 客户可以保存电话到通讯录。
- [ ] 客户可以拨打电话。
- [ ] 企业管理员只能管理本企业员工和名片。
- [ ] A 企业看不到 B 企业数据。
- [ ] 可选显示添加企业微信按钮。
- [ ] 有基础访问统计。
- [ ] 敏感字段有展示开关。

---

## 24. 推荐仓库结构

```text
business-card-saas/
  README.md
  docs/
    wecom-business-card-saas-dev-doc.md
    api.md
    database.md
    wecom-integration.md
    mini-program-pages.md
  apps/
    mini-program/
    admin-web/
    api-server/
  packages/
    shared-types/
    ui/
  infra/
    docker/
    k8s/
  scripts/
  tests/
```

---

## 25. 研发启动建议

建议第一步不要直接写所有企业微信高级能力，而是先启动三个并行小组：

1. **小程序体验组**：名片详情页、保存通讯录、分享、海报。
2. **平台架构组**：多租户、account、member_identity、card、权限中间件。
3. **企业微信预研组**：第三方应用授权、wx.qy.login、客户联系、许可规则。

先完成 M1 + M2，产品就能跑起来；M3 + M4 再逐步补齐企业微信增强能力。这样既不会被企业微信权限和许可卡住，也能尽快让领导看到一个能分享、能保存电话、能体现品牌统一性的产品原型。
