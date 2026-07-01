# 01_03 小程序执行指引

版本：v1 · 日期：2026-07-01 · 归属：小程序体验组
关联主文档：[`../00-core/00_01_Dev_Doc.md`](../00-core/00_01_Dev_Doc.md) 的 §6（员工流程）、§7（客户流程）、§11（详情页）、§12.1/12.2（页面）、§30（分享公开模型）
栈：原生微信小程序 + TypeScript（兼容 `wx.qy.*`，§33）。

---

## 1. 环境判定与登录

- 判定运行环境：普通微信 vs 企业微信工作台（`wx.qy.*` 可用性）。
- 企业微信：`wx.qy.login` 取 code → 后端 qy-login（§6.1 / 见 [`01_01_Wecom_Integration.md`](01_01_Wecom_Integration.md) §6）。
- 普通微信：`wx.login` 取 code → 后端 wx-login；unionid 可能为空，走 openid-only 降级（§6.2）。
- 多身份默认进 `account_preferences.last_member_identity_id`，不每次强弹选择器（§6.2）。

## 2. 页面清单与路由

员工端（§12.1）：`employee/index`、`identity-switch`、`edit`、`share`、`poster`、`stats`、`bind`。
客户端（§12.2）：`card/detail`、`card/poster`、`card/company`、`card/cases`、`card/contact`。

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

- 每次分享由后端签发 `share_id`（POST employee share）；二次转发生成派生 `share_id`（`parent_share_id`）。
- 客户端上报的 `channel` 仅辅助，来源以服务端 `share_id` 反查为准。

## 4. 名片详情页（§11）

- 首屏：头像/姓名/职位/公司/部门/品牌背景/核心标签。
- 主操作：`[保存到通讯录] [拨打电话]`；辅助：复制、官网、案例、导航、加企微、海报、转发（§11.2 优先级）。
- **字段展示 = 企业规则 AND 名片 privacy AND 字段存在 AND active**（§11.3）；手机号默认不展示。
- 加企微入口按能力/许可降级隐藏（§9.3）。
- 首屏性能：骨架屏 + 公开字段优先渲染；内容随 `public_id` 缓存（§32）。

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

- 详情页首次加载领 `visit_token`；动作上报带 token，`(visit_id, action_type)` 幂等（§14.3）。
- 动作类型见 [`00-core/00_02_Database_Schema.md`](../00-core/00_02_Database_Schema.md) §4；口径见 §32。

## 8. 待核对

- 企业微信小程序 `wx.qy.*` 在目标基础库版本的可用能力集。
- 半屏/H5 兜底的取舍（当前 H5 为阶段增强，§30.3）。
