# 企业名片 SaaS 文档索引

> 文档目录参考 moread 约定：编号前缀分类 + `NN_MM_Title` 文件命名 + 本索引统一维护。

## 目录约定

- `00-core/`：核心技术文档（架构、身份模型、数据库、页面路由、环境）
- `01-specs/`：功能规格文档（用于功能设计与验收口径、开发执行指引）
- `02-tasks/`：任务执行记录与计划（里程碑拆分、Deferred）
- `03-compliance/`：合规（PIPL、隐私政策、用户协议、第三方 SDK 清单）
- `88-planning/`：中长期规划（产品愿景、路线图、商业化、部署与运维、灾备）
- `99-audits/`：审计记录
- `design/`：设计交付与素材（原型、图标、切图）

## 命名规范

- 编号文件：`NN_MM_Title_With_Underscores.md`，`NN` 为类目号、`MM` 为序号。
- 审计文件：`99_NN_<描述>.md`，按时间顺序递增。
- 设计等非编号资料放 `design/`，用小写短横线命名。

## 文档索引

### 00-core（核心）

| 文档 | 内容 |
|------|------|
| [`00_01_Dev_Doc.md`](00-core/00_01_Dev_Doc.md) | 主开发文档：架构、身份模型、DDL(§15)、里程碑、技术栈决策(§33)、审计对照 —— **全项目事实源** |
| [`00_02_Database_Schema.md`](00-core/00_02_Database_Schema.md) | 迁移顺序、RLS 策略（含跨租户敏感绑定表与 public_card_directory）、外键策略、ER、枚举取值、索引口径（表定义仍以 §15/§15.4 为准） |

### 01-specs（功能规格 / 执行指引）

| 文档 | 内容 |
|------|------|
| [`01_01_Wecom_Integration.md`](01-specs/01_01_Wecom_Integration.md) | 企业微信第三方应用对接：凭据体系、双回调、授权闭环、wx.qy.login、通讯录同步、客户映射、任务拆分（扩展 §8/§10/§13.3） |
| [`01_02_Api_Spec.md`](01-specs/01_02_Api_Spec.md) | 接口契约：路径、鉴权、请求/响应、错误码、分页（扩展 §14/§28） |
| [`01_03_Miniprogram_Guide.md`](01-specs/01_03_Miniprogram_Guide.md) | 小程序：环境/登录、页面路由、分享矩阵、详情页、状态降级、埋点（扩展 §6/§7/§11/§12/§30） |
| [`01_04_Admin_Web_Guide.md`](01-specs/01_04_Admin_Web_Guide.md) | 管理后台：登录鉴权、RBAC、页面清单、隔离约束（扩展 §12.3/§16/§15.3） |

### 03-compliance（合规）

| 文档 | 内容 |
|------|------|
| [`03_01_PIPL.md`](03-compliance/03_01_PIPL.md) | 个人信息保护：告知同意、主体权利、留存最小化、SDK/出境、上线验收清单（扩展 §26） |

### 02-tasks（任务执行）

| 文档 | 内容 |
|------|------|
| [`02_00_M0_Platform_Verification.md`](02-tasks/02_00_M0_Platform_Verification.md) | M0 平台接入 + 企业微信关键接口实测 Spike（M1 开工门槛，扩展 §19；审计 A4-P0-5） |
| [`02_01_M1_Walking_Skeleton.md`](02-tasks/02_01_M1_Walking_Skeleton.md) | M1 垂直切片阻塞项与验收（扩展 §19/§23） |

> 后续待建（进入对应线时，不提前、不复制正文）：
> `88-planning/`（产品愿景/路线图/商业化/部署运维）、
> `03-compliance/03_02_SDK_Inventory.md`。

### 99-audits（审计）

| 文档 | 内容 |
|------|------|
| [`99_01_Design_Audit.md`](99-audits/99_01_Design_Audit.md) | 设计审计（原 audit_01） |
| [`99_02_Landability_Audit.md`](99-audits/99_02_Landability_Audit.md) | 落地性深度审计（原 audit_02） |
| [`99_03_Docs_Split_Audit.md`](99-audits/99_03_Docs_Split_Audit.md) | 文档拆分一致性审计 |
| [`99_04_Implementation_Readiness_Audit.md`](99-audits/99_04_Implementation_Readiness_Audit.md) | 实施就绪深度审计（P0/P1/P2） |
| [`99_05_Verification_And_New_Findings.md`](99-audits/99_05_Verification_And_New_Findings.md) | 核验 #04 + 新发现（N-1/N-2）；修复见 §15.4 |
| [`99_06_Deep_Audit_And_Fixes.md`](99-audits/99_06_Deep_Audit_And_Fixes.md) | 九维度深度审计（架构/平台对接/安全/代码高效/运行流畅/信息隔离/数据准确/参数传递/用户体验）+ 修复落地（v0.4.7） |
| [`99_07_Nine_Dimension_Docs_Reaudit.md`](99-audits/99_07_Nine_Dimension_Docs_Reaudit.md) | 九维度开发文档复审（#06 后）：无新 P0；4 个 P1、5 个 P2 已修复落地 |

## 建议阅读顺序

1. [`00-core/00_01_Dev_Doc.md`](00-core/00_01_Dev_Doc.md) — 先读 §0 结论、§1 目标、§33 技术栈决策
2. 身份模型 §5、总体架构 §3、数据隔离 §16
3. 里程碑 §19、验收 §23

## 文档维护规则

- **单一事实源**：主文档是决策事实源；各 `01-specs` 指引是其领域执行细节事实源。不复制正文，跨文档用相对链接互引。
- **以实现为准**：文档与代码冲突时以代码为准并立即修订。
- **变更同步**：路由、数据库结构、企业微信链路、技术选型变更时同步更新 `00-core` 与相关 spec；技术选型以 §33 为唯一事实源。
- **审计**：报告放 `99-audits/`，按最新文件为准，不在索引维护易过期的“全部关闭”统计。
