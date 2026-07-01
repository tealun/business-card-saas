# Audit #05 — #04 findings verification + new findings

日期：2026-07-01
审计对象：`docs/` v0.4.5 文档体系（HEAD `2ca0125`）
审计类型：**核验前次审计（#04）真实性 + 补充新问题**
自动分级：Deep（风险分 ≥ 6：企业微信第三方接入 +3、PII/加密 +3、多租户 admin/permission +3、webhook 回调 +1）
基线：`docs/99-audits/99_04_Implementation_Readiness_Audit.md`

> 说明：自 #04（本日提交）以来工作区无改动，#04 所列 P0/P1 全部仍为开放状态。本轮不重复列举修复建议，只做两件事：(1) 逐条核验 #04 findings 是否属实（防止上一轮审计凭空捏造）；(2) 报告 #04 未覆盖的新问题。

---

## 1. #04 findings 核验（Verification Log）

每条已 `grep`/`read` 回原文确认，标注行号：

| #04 ID | 结论 | 证据（文件:行） |
|--------|------|-----------------|
| A4-P0-1 公开 `public_id` 查询与 RLS 启动矛盾 | ✅ 属实 | 主文档全文无 `public_card_directory`；`GET /api/public/cards/{public_id}` 无 tenant 上下文（`00_01` §14.3:1304），而 `cards` 启用 RLS（`00_02` §2:31-36） |
| A4-P0-2 `account_identity_bindings` 归为非 RLS 平台表 | ✅ 属实 | `00_02` §2:42 明确把 `account_*` 列为「不启用租户 RLS」 |
| A4-P0-3 Node 20 已 EOL | ✅ 属实 | `00_01`:236「Node.js 20 LTS」、2583/2587 同源；当前 2026-07-01，Node 20 已于 2026-04-30 EOL |
| A4-P0-4 `contact_ways.channel` 可空破坏唯一约束 | ✅ 属实 | DDL `channel VARCHAR(64)` 可空（`00_01`:1527/1548），约束 `UNIQUE(...,channel)`（§9.1:852）；PG 允许多 NULL |
| A4-P0-5 企微关键字段停在「待核对」 | ✅ 属实 | `01_01` §6/§13 待核对；`02-tasks/` 仅 `.gitkeep`，M0 Spike 文件未建 |
| A4-P1-1 PostgreSQL 14+ 接近 EOL | ✅ 属实 | `00_01`:244/247「PostgreSQL 14+」、2587 同源 |
| A4-P1-2 灾备用 MySQL 术语 `binlog` | ✅ 属实 | `00_01` §31.3:2525「每日全量 + 15 分钟增量 binlog」，与 PostgreSQL 选型冲突 |
| A4-P1-9 `is_default` 双事实源 | ✅ 属实（且非误报） | `account_identity_bindings.is_default`（:1447）vs `account_preferences.default_member_identity_id`（:1740）。注：另一处 `is_default`（:1610）属 `templates` 表，为合法字段，#04 未误伤 |
| A4-P1-8 API 路径事实源漂移 | ✅ 属实，**且低估**（见 N-1） | 主文档 §14 用 `/api/...`（:1269-1348），`01_02` 用 `/api/v1`（:37+） |
| A4-P2-1 缺根 README | ✅ 属实 | 仓库根仅 `docs/` + `.git`，无 `README.md` |

**结论：#04 抽检 10 条全部属实，未发现捏造或严重误报。** #04 报告可信，可作为修复依据。

---

## 2. 新问题（#04 未覆盖）

### N-1（P1，安全 + 事实源）：公开「联系我」接口用内部自增 `card_id`，自相矛盾且泄漏内部 ID

**位置**：主文档 §14.4:1329/1332，对比 §14.3:1304、API 规格 `01_02` §3.4，隔离原则 §17.3/§30.1

**现状**：

```text
主文档 §14.4:  GET  /api/contact-way/cards/{card_id}
               POST /api/contact-way/cards/{card_id}/refresh
API 规格 §3.4: GET  /api/v1/contact-way/cards/{public_id}
```

同一批公开接口，主文档用内部自增 `{card_id}`，API 规格用 `{public_id}`。

**风险**：

- 主文档 §14.3:1320 自己刚写「**所有公开路由改用 public_id**」，§17.3/§30.1 要求「公开路由不暴露内部自增 ID」，但紧邻的 §14.4 又把 `card_id` 放进公开 URL —— 文档内部自相矛盾。
- 若按主文档实现，公开「联系我」接口暴露可枚举自增 `card_id`，与 A2-P0-2 当初修 `public_id` 的初衷背道而驰。
- #04 的 A4-P1-8 只指出「缺 `/api/v1` 前缀」，**低估了此处**：真正问题是路径参数 `card_id` vs `public_id` 的语义冲突，比版本前缀严重。

**修复建议**：

- 主文档 §14.4 公开接口统一改 `{public_id}`，与 §14.3 及 `01_02` §3.4 对齐。
- 按 A4-P1-8 收口：主文档 §14 只留分组指针，路径/参数以 `01_02_Api_Spec.md` 为唯一事实源，避免再次漂移。
- CI/评审加一条：公开路由（`/public/*`、`/contact-way/*`）路径参数只允许 `public_id` / `share_id`，禁止内部自增 ID。

### N-2（P2，文档治理）：README 索引漏登 `99_04`（且将漏 `99_05`）

**位置**：`docs/README.md` §99-audits 表（:54-56）

**现状**：索引只列 `99_01/02/03`，本日已提交的 `99_04_Implementation_Readiness_Audit.md` 未登记；README 自称「本索引统一维护」，已开始滞后。

**修复建议**：索引补 `99_04`、`99_05`；或在维护规则里改为「审计以目录最新文件为准」，避免每次新增审计都要改索引（README:69 已有此意，但表格仍逐条列，二者不一致）。

---

## 3. 修复顺序建议（并入 #04）

1. 先修 #04 全部 P0（A4-P0-1..5）—— 仍全部开放。
2. 修 N-1 时，与 A4-P1-8 一并收口 API 路径事实源（一次改完 §14 全部路径 + 参数）。
3. N-2 随任意一次文档提交顺手修。

---

## 4. 工具调用审计（Tool-Call Audit）

- `git log/status`：确认 HEAD=`2ca0125`、工作区干净 → #04 findings 未被修复，仍开放。
- `grep`（Node/PostgreSQL/binlog/is_default/channel/public_id/api 路径）：逐条命中原文行号 → 支撑第 1 节核验表。
- `read`（`00_02`/`01_02`/`03_01` 全文、`00_01` §14.3/§14.4）→ 支撑 N-1、第 1 节。
- `sed/grep`（is_default 上下文表名、根 README、02-tasks 目录）→ 确认 A4-P1-9 非误报、N-2、A4-P2-1/P0-5 仍开放。

**覆盖检查**：done_definition =「核验 #04 + 找新问题」。第 1 节覆盖核验（10/10 属实），第 2 节覆盖新问题（N-1/N-2）。达成。

---

## 5. 修复落地（2026-07-01，v0.4.6）

用户批准后，#04 + #05 全部 findings 已落地文档。外键采用**方案 A（M1 加关键外键）**。逐条位置：

| Finding | 修复位置 | grep 锚点 |
|---------|----------|-----------|
| A4-P0-1 public_id/RLS 死锁 | `00_01` §15.4 新增 `public_card_directory` + 公开访问流程；DB 指引 §2 | `public_card_directory` |
| A4-P0-2 account 绑定表 RLS | `00_01` §15.4 两类上下文 policy；DB 指引 §2「跨租户敏感绑定表」 | `aib_tenant_ctx` |
| A4-P0-3 Node 20 EOL | `00_01` §3.1 / §33.1 → Node 24 LTS | `Node.js 24 LTS` |
| A4-P0-4 channel 可空 | `00_01` §15.3 `channel NOT NULL DEFAULT 'default'` + active 部分唯一 | `uk_cw_static_member_channel_active` |
| A4-P0-5 企微 M0 Spike | 新建 `02-tasks/02_00_M0_Platform_Verification.md`；企微指引「待核对」加指针 | `02_00_M0` |
| A4-P1-1 PG 14+ | `00_01` §3.1 / §33.1 → PostgreSQL 17+（推荐 18） | `PostgreSQL 17+` |
| A4-P1-2 binlog | `00_01` §31.3 → base backup + WAL 归档 + PITR | `WAL 归档` |
| A4-P1-3 软删除唯一约束 | `00_01` §15.4 partial unique（slug / identity_type / state） | `_active` |
| A4-P1-4 无外键风险 | `00_01` §15.4 方案 A 关键复合外键；DB 指引 §1 | `fk_cards_member` |
| A4-P1-5 owner bootstrap | `00_01` §15.4 `admin_claim_tokens` + 流程 | `admin_claim_tokens` |
| A4-P1-6 growth_leads 双角色 | PIPL §1 双角色表；`00_01` §15.3 加 consent/source 字段 | `consent_version` |
| A4-P1-7 visit_token 契约 | `00_01` §14.6 | `14.6 visit_token 契约` |
| A4-P1-8 API 路径漂移 | `00_01` §14 改为分组 + 指针，不再列路径 | `不再列具体路径` |
| A4-P1-9 is_default 双源 | `00_01` §5.5 prose + §15 DDL 移除 `account_identity_bindings.is_default` | `A4-P1-9` |
| A4-P1-10 Prisma RLS 事务 | `00_01` §33.2 硬约束 `TenantTx.run` | `TenantTx.run` |
| A4-P2-1 根 README | 新建 `README.md` | — |
| A4-P2-2 测试门禁 | `00_01` §20.6 覆盖率 + PR 门禁 | `20.6` |
| A4-P2-3 02-tasks 检查单 | 新建 `02_00` / `02_01` | — |
| A4-P2-4 H5 兜底细节 | `00_01` §30.3 noindex/OG/canonical/缓存同源 | `A4-P2-4` |
| N-1 公开路由 card_id 泄漏 | `00_01` §14.4 改 `public_id`（与 `01_02` §3.4 对齐） | `A5-N-1` |
| N-2 README 索引滞后 | `docs/README.md` 补 99_04/99_05 + 02-tasks | — |

> 注：本项目为文档阶段，「修复」= 修订文档事实源；无代码改动。上线实现时以上述文档为准。

