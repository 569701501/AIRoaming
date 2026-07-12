---
doc_id: AIR-G3-M4-ACCEPTANCE-001
status: pending_signoff
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa, reviewer
source: task_plan.md、handoff.md、scrutiny_review.md、runtime_user_review.md、evidence/verification.summary.json
---

# M4 正式验收清单（待签字）

## 1. 验收边界

- 基线：`0c3295b`。
- 当前实现提交：`4972d8e`；证据同步提交：`c040a1a`。
- 范围：来源证据注册表、16 个 shadow slice、full shadow 编排、`db:verify` 只读校验、DB read-model/API/Asset 等价和 DB-only 写隔离。
- 当前状态：`in_progress`。本清单不是正式签字，不得据此把 M4 标记为 `completed`。
- 既有 12 张截图删除不属于本任务，未纳入任何提交。

## 2. 证据矩阵

| 验收项 | 证据 | 当前结论 |
| --- | --- | --- |
| entityType 来源注册、single/composite/runtime 分类互斥 | `migration-source-evidence.registry.spec.ts`；`IMP-M4-03～10` | 证据齐全，fail-closed |
| Chapter 复合摘要与 `sourceText` fallback | `IMP-M4-07` | 证据齐全 |
| runtime bundle/settings 转换来源锚定 | `IMP-M4-02/05` | 证据齐全 |
| 16 slice 固定顺序、full replay、双 fresh 一致 | `IMP-M3-FULL-01/02/03`、`IMP-M4-FRESH-01` | 证据齐全 |
| blocked/failed prerequisite fail-fast 且不创建下游 run | `IMP-M3-FULL-02/03`、`IMP-M4-29` | 证据齐全 |
| 来源计数、verification attestation、decisions/report artifact 三方绑定 | `IMP-M4-08～25` | 证据齐全，fail-closed |
| `db:verify` 真实 CLI 成功与缺参入口 | `IMP-M4-26/27` | 证据齐全 |
| full `db:import` 真实 CLI 成功/blocked | `IMP-M4-28/29` | 证据齐全 |
| `--kind final` 入口保持 fail-closed | `IMP-M4-30` | 证据齐全，未实现 final import |
| 16 个独立 `db:import --slice` 真实 dispatch | `IMP-M4-31` | 证据齐全 |
| DB read-model/API/Asset hash/旧 workspace 写隔离 | `IMP-M4-API-01` 与 M4 fresh 证据 | 证据齐全 |
| 全量回归与静态门禁 | 迁移集成 58/58；server 47 文件/303 tests；typecheck、G1 三项、Prisma validate、diff check | 证据齐全 |

## 3. 明确不纳入本次签字

- `db:import --kind final` 仍 fail-closed；没有 production final importer。
- M5 backup/restore、SecretStore/capability gate 未实现。
- M6 activate/cutover、current release、first business write 和用户授权流程未执行。
- 不执行真实生产 workspace、真实数据库或真实 activate。

## 4. 签字栏

- Reviewer：
- 复核日期：
- 决定：`pending`
- 备注：
