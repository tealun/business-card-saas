# 企业名片 SaaS

基于**企业微信第三方服务商**模式的企业电子名片 SaaS：员工从企业微信/微信打开自己的名片并分享，客户访问、保存、加企微，企业侧统计转化与沉淀客户。多租户、隐私默认收紧、PIPL 合规。

## 当前状态

- 阶段：**文档/方案就绪，尚未进入编码**。技术栈已锁定（§33），schema 与关键链路已过多轮落地性/实施就绪审计。
- 下一步：先完成 M0 平台接入与企业微信接口实测 Spike，再进入 M1 walking skeleton。

## 阅读入口

文档全部在 [`docs/`](docs/)，索引见 [`docs/README.md`](docs/README.md)。建议顺序：

1. [`docs/00-core/00_01_Dev_Doc.md`](docs/00-core/00_01_Dev_Doc.md) — 主开发文档 / 全项目事实源（先读 §0 结论、§1 目标、§33 技术栈）。
2. 身份模型 §5、总体架构 §3、数据隔离 §16。
3. 里程碑 §19、验收 §23。

## 技术栈（§33 为唯一事实源）

Node.js 24 LTS + TypeScript + NestJS · PostgreSQL 17+（RLS 多租户）· Prisma · Redis / BullMQ · React + Vite + Ant Design（后台）· 原生微信小程序 · 腾讯云 COS / KMS · Docker → Kubernetes · GitHub Actions。

## M0 / M1 目标

- **M0**：平台/服务商资质与应用接入（有审核周期，并行前置轨）+ 企业微信关键接口实测 Spike（见 [`docs/02-tasks/02_00_M0_Platform_Verification.md`](docs/02-tasks/02_00_M0_Platform_Verification.md)）。
- **M1**：垂直切片 walking skeleton — 员工从企业微信工作台打开 → wx.qy.login 识别 → 名片详情 → 公开访问埋点（见 [`docs/02-tasks/02_01_M1_Walking_Skeleton.md`](docs/02-tasks/02_01_M1_Walking_Skeleton.md)）。
