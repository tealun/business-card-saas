# 01_03 小程序执行指引

版本：v1.2 · 日期：2026-07-06 · 归属：小程序体验组
关联主文档：[`../00-core/00_01_Dev_Doc.md`](../00-core/00_01_Dev_Doc.md) 的 §6（员工流程）、§7（客户流程）、§11（详情页）、§12.1/12.2（页面）、§30（分享公开模型）
栈：原生微信小程序 + TypeScript（兼容 `wx.qy.*`，§33）。

---

## 1. 环境判定与登录

- 判定运行环境：普通微信 vs 企业微信工作台（`wx.qy.*` 可用性）。
- 企业微信：`wx.qy.login` 取 code → 后端 qy-login（§6.1 / 见 [`01_01_Wecom_Integration.md`](01_01_Wecom_Integration.md) §6）。
- 普通微信：`wx.login` 取 code → 后端 wx-login；unionid 可能为空，走 openid-only 降级（§6.2）。若没有企业身份，后端自动创建 `personal` 个人名片身份。
- 多身份默认进 `account_preferences.last_member_identity_id`，不每次强弹选择器（§6.2）。用户可在“当前发送身份”中切换个人名片或企业名片。
- 同一账号可同时拥有 `personal` 个人名片与多个 `wecom_member` 企业员工名片；企业同步资料不能覆盖个人名片。

## 2. 页面清单与路由

员工端（§12.1）：`employee/index`、`identity-switch`、`edit`、`share`、`poster`、`stats`、`bind`。
客户端（§12.2）：`card/detail`、`card/poster`、`card/company`、`card/cases`、`card/contact`。

M2 起按参考体验补齐三栏主导航：

| Tab | 路由 | 说明 |
|-----|------|------|
| 首页 | `pages/employee/index` | 我的名片工作台：名片预览、状态提醒、发名片、快捷工具、访客数据 |
| 名片夹 | `pages/card-wallet/index` | 收到的名片、交换请求、名片更新、搜索、拍名片；MVP 可空状态 |
| 企业名片 | `pages/company-card/index` | 企业模板、团队成员、企业内容入口；完整管理仍以 Web 后台为主 |

设计交付参考 [`../design/miniprogram-card-experience-brief.md`](../design/miniprogram-card-experience-brief.md)。

**路由只带 `public_id` + `share_id`，绝不带内部 ID（§30.1）**：

```text
/pages/card/detail?card=pub_8k3h29x2&share=shr_a9K2mQ
```

## 3. 分享矩阵（§6.3 / §30.2）

| 渠道 | 机制 | 要点 |
|------|------|------|
| 会话 / 群 | `onShareAppMessage` 带 `card`+`share` | 标题/封面按名片个性化（姓名+公司） |
| 朋友圈 | 小程序码海报图 | 小程序**不能直接**转发朋友圈 |
| 复制链接/短信/邮件 | H5 兜底页 `/c/{public_id}` | 微信内引导打开小程序（§30.3） |
| 线下/展会 | 海报小程序码 | `scene` ≤32 字符，只放 `share_id`（A3-8） |

- 员工分享由后端签发 `share_id`（POST employee share，JWT）；**客户二次转发**在 `onShareAppMessage` 前调公开派生接口 `POST /public/cards/{public_id}/shares/derive`（visit_token 鉴权，深度上限 3，超限沿用父 share，A6-P1-2）；派生失败降级沿用当前 `share`，不阻塞转发。
- 客户端上报的 `channel` 仅辅助，来源以服务端 `share_id` 反查为准。

## 4. 名片详情页（§11）

- 首屏：头像/姓名/职位/公司/部门/品牌背景/核心标签。
- 主操作：`[保存到通讯录] [拨打电话]`；辅助：复制、官网、案例、导航、加企微、海报、转发（§11.2 优先级）。
- **字段展示 = 企业规则 AND 名片 privacy AND 字段存在 AND active**（§11.3）；手机号默认不展示。
- 加企微入口按能力/许可降级隐藏（§9.3）。
- 首屏性能：骨架屏 + 公开字段优先渲染；内容随 `public_id` 缓存（§32）。

### 4.1 访客详情页内容型升级

访客看到的页面不应只是一张联系方式卡片，而是「员工名片 + 企业内容背书」：

1. 员工名片首屏
   - 支持企业 Logo、员工头像、姓名、职位、公司、地址、手机、座机、邮箱。
   - 支持 `template.background_url`、`template.color_scheme`、`template.layout` 渲染自定义背景和版式。
   - 支持名片状态提示：active、disabled、expired、employee_left、tenant_cancelled。

2. 联系动作区
   - 电话、邮箱、地址、微信/企微、纸质名片、保存到通讯录、转发。
   - 每个动作都走 `POST /public/cards/{public_id}/actions`，并带 `visit_token`。

3. 公司介绍
   - 标题、富文本正文、图片。
   - 支持折叠/展开全文。
   - 内容由企业管理员维护，员工仅引用；企业允许时可让员工补充个人介绍。

4. 企业视频
   - 主视频封面、标题、播放。
   - 视频来源必须是对象存储或审核通过的 `https://` 地址。

5. 公司荣誉
   - 荣誉标题、正文、图片数组。
   - 图片用 `swiper` 左右轮播，支持点击 `wx.previewImage` 预览大图。
   - 每张图片可显示标题/说明。

6. 底部固定操作
   - 访客视角：保存电话、拨打电话、加企微、转发。
   - 员工预览视角：编辑、个人信息、名片样式、隐私设置、发名片。

### 4.2 员工首页工作台

`pages/employee/index` 应包含：

- 状态提醒：企业名片过期、试用过期、名片停用、信息未完善。
- 当前名片预览：按模板真实渲染，而不是普通字段列表。
- 快捷操作：编辑资料、名片样式、切换名片。
- 主按钮：发名片。
- 工具入口：名片图片、文字转名片、名片榜单、名片码、全部。
- 交换请求卡片：忽略、同意。
- 我的名片数据：我的访客、我看过的、好友新名片、最近访客。

M1 可先实现名片预览、编辑、发名片；M2 补齐数据卡、交换请求与工具入口。

### 4.3 企业名片页

`pages/company-card/index` 应包含：

- 当前企业数字名片：Logo、企业名、认证/试用/过期状态。
- 企业模板：当前模板、编辑模板、查看全部、添加员工。
- 团队成员：已加入、待审核、待激活、成员动态。
- 企业内容入口：公司介绍、企业视频、公司荣誉。
- 邀请同事使用企业名片。

完整的模板、成员和内容维护默认放 Web 后台，小程序端提供轻量入口和预览。

### 4.4 名片夹页

`pages/card-wallet/index` 属 M3 增强，包含：

- 搜索：姓名 / 公司 / 职位。
- 微信名片组、交换请求、名片更新。
- 所有名片列表：头像、姓名、职位、公司、日期、交换状态。
- 拍名片、批量导出入口。

## 5. 授权与信息采集（合规）

- 查看名片、保存电话**不强制授权**（§7.1）。
- 昵称/头像用「头像昵称填写能力」（`chooseAvatar` + `type="nickname"`），不用 `getUserProfile`（§7.2/D-P1-6）。
- 手机号 `getPhoneNumber`：付费能力，`button open-type` 触发，用户主动授权后才采集（§5.2）。
- 任何身份授权前弹**个人信息处理告知**（见 [`../03-compliance/03_01_PIPL.md`](../03-compliance/03_01_PIPL.md)）。

## 6. 状态与降级 UX（§30.4）

| 情况 | 展示 |
|------|------|
| 加载 | 骨架屏 |
| public_id 不存在 | “名片不存在或已删除” |
| 名片已停用 | “该名片已停用”，可跳企业主页 |
| 员工离职 | “该员工已离开，可联系企业”，隐藏加企微 |
| 企业取消授权 | 基础名片只读，隐藏企业微信增强动作 |

## 7. 埋点

- 详情页首次加载调 `POST /visit` 记访问并**由其响应领取 `visit_token`**（GET 内容接口可缓存、不下发 token，A6-P0-1）；动作上报带 token，`(visit_id, action_type)` 幂等（§14.3/§14.6）。首访同时下发 `anon_id` 本地保存、后续回传，用于匿名 UV 去重（§32.1）。
- 动作类型见 [`00-core/00_02_Database_Schema.md`](../00-core/00_02_Database_Schema.md) §4；口径见 §32。

内容型详情页新增动作建议：

| 动作 | action_type |
|------|-------------|
| 播放企业视频 | `play_company_video` |
| 查看荣誉图片 | `view_honor_image` |
| 展开公司介绍 | `expand_company_intro` |
| 预览纸质名片 | `view_paper_card` |
| 点击官网 | `view_site` |
| 打开地图 | `open_map` |

## 8. 待核对

- 企业微信小程序 `wx.qy.*` 在目标基础库版本的可用能力集。
- 半屏/H5 兜底的取舍（当前 H5 为阶段增强，§30.3）。
- 微信侧「绑定微信账号」（§6.1 末步 / §6.2）的验证方式（企业微信侧发起确认 / 手机号短信验证 / 邀请码）与 `/pages/employee/bind` 交互细节，M2 开工前定稿（审计 A6-P2-8）。
