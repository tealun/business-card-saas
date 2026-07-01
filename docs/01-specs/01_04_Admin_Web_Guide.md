# 01_04 管理后台执行指引

版本：v1 · 日期：2026-07-01 · 归属：后台 / 平台
关联主文档：[`../00-core/00_01_Dev_Doc.md`](../00-core/00_01_Dev_Doc.md) 的 §2.2/2.3（角色）、§12.3（管理端页面）、§16（权限与隔离）、§15.3（tenant_admins）
栈：React + TypeScript + Vite + Ant Design（§33）。

---

## 1. 登录与鉴权（§15.3）

- **企业管理员**：企业微信扫码 / OAuth 登录，绑定 `tenant_admins`（`open_userid`）。第一版不做纯密码登录。
- **平台管理员**：独立后台账号 + **MFA**；分级 超级管理员 / 客服运营 / 技术运维 / 只读审计（§16.2）。
- 会话：JWT + Redis；后台接口经租户中间件注入 `tenant_id`，配合 RLS（§16.1）。

## 2. 角色与权限（RBAC）

| 角色（`tenant_admins.role`） | 权限 |
|------------------------------|------|
| owner | 企业全部配置 + 管理员管理 |
| admin | 员工/名片/模板/字段规则/统计 |
| operator | 日常运营（启停名片、查看统计） |
| auditor | 只读 + 操作日志 |

平台管理员为独立体系，可跨租户运维但**默认脱敏**、走 `BYPASSRLS` 受审计角色（§16.2 / [`../00-core/00_02_Database_Schema.md`](../00-core/00_02_Database_Schema.md) §2）。

## 3. 页面清单（§12.3）

| 路由 | 功能 | 可见 |
|------|------|------|
| `/admin/login` | 登录 | — |
| `/admin/dashboard` | 数据看板（口径 §32） | 租户/平台 |
| `/admin/tenants` | 租户管理 | **仅平台** |
| `/admin/members` | 员工管理（启停、字段编辑权限） | 租户 |
| `/admin/cards` | 名片管理（启停触发缓存失效 §32） | 租户 |
| `/admin/templates` | 模板管理 | 租户 |
| `/admin/fields` | 字段规则（企业硬边界，§11.3） | 租户 |
| `/admin/contact-way` | 客户联系配置（策略 §9.1） | 租户 |
| `/admin/licenses` | 接口许可 / 套餐状态 | 租户/平台 |
| `/admin/audit-logs` | 操作日志（§15.3 audit_logs） | 租户/平台 |

## 4. 关键约束

- **数据隔离**：所有列表/详情经 RLS + 中间件；严禁前端传 tenant_id；跨租户访问返回 `30001`（§16.1）。
- **字段规则优先级**：企业禁用字段，员工端只读“企业不允许展示”，不可自开（§11.3）。
- **敏感数据**：手机号/邮箱/微信号列表默认脱敏；`audit_logs.detail_json` 敏感字段只记 hash/掩码（§31.5）。
- **审计留痕**：管理端写操作统一落 `audit_logs`（actor/action/target/before-after-hash）。

## 5. 待核对

- 企业微信管理员 OAuth 登录与 `tenant_admins` 首次绑定流程细节（见 [`01_01_Wecom_Integration.md`](01_01_Wecom_Integration.md)）。
- 平台管理员 MFA 方案（TOTP / 短信）选型。
