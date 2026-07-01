# 文档中心（docs/）

本目录按**类目分子目录**管理项目全部文档。**禁止在 `docs/` 根平铺散放**（除本索引外）。

## 目录结构

| 子目录 | 存放内容 | 归属 |
|--------|----------|------|
| [`architecture/`](architecture/) | 架构与技术决策：主开发文档、ADR（架构决策记录） | 技术负责人 |
| [`guides/`](guides/) | 开发执行指引：企业微信对接、数据库、API 契约、小程序、后台 | 各开发小组 |
| [`product/`](product/) | 产品：PRD、需求、原型说明、增长 | 产品负责人 |
| [`ops/`](ops/) | 运维：部署、环境、灾备、监控、上线前置清单 | 运维 |
| [`compliance/`](compliance/) | 合规：PIPL、隐私政策、用户协议、第三方 SDK 清单 | 法务 / 技术 |
| [`audits/`](audits/) | 审计报告（设计审计、落地性审计、代码审计等） | 评审 |

## 当前文档索引

- 架构主文档（事实源）：[`architecture/wecom-business-card-saas-dev-doc.md`](architecture/wecom-business-card-saas-dev-doc.md)
- 审计报告：
  - [`audits/audit_01_dev-doc.md`](audits/audit_01_dev-doc.md) — 设计审计
  - [`audits/audit_02_dev-doc-v0.3-landability.md`](audits/audit_02_dev-doc-v0.3-landability.md) — 落地性深度审计

> 执行指引（`guides/` 下的 wecom-integration / database / api-spec 等）将在进入对应开发线时从主文档抽取，见下方治理规范。

## 文档治理规范

1. **单一归属 / 单一事实源**：每块内容只有一个权威文件。主文档（architecture）是**决策**的事实源；各执行指引是**该领域执行细节**的事实源。
2. **不复制正文**：跨文档只用相对链接互引，不粘贴重复内容，避免漂移。
3. **命名**：小写短横线（kebab-case），如 `wecom-integration.md`；审计用 `audit_NN_<desc>.md`。
4. **版本 / 更新**：每份文档头部标注版本与日期；重大变更登记到主文档 §33.3（技术决策）或对应审计。
5. **技术选型**：以主文档 **§33 技术栈与工程决策** 为唯一事实源，实现期不再重新选型。
