---
doc_id: AIR-TASK-20260711-G1-G5-IMPLEMENTATION-PLAN
status: superseded
created: 2026-07-11
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户恢复的 G0–G5 Goal、G0 完成记录、G1–G5 accepted 方案与当前代码审计
---

# G1 至 G5 连续实施总控计划

## 纠偏接管说明（2026-07-12）

本计划的产品目标仍然有效，但原执行顺序、自签双 Reviewer 写门禁，以及“G2 必须等待 G1-10 `WIT-01`”的开始条件，已由 `ADR-0014` 和 `2026-07-12_G1纠偏与DB垂直切片` 任务接管并替代。以下基线、切片状态和“当前下一步”保留为失控复盘前的历史快照，不再作为当前执行指令。

## 目标

保留已完成的 G0 安全网，按 `G1 → G2 → G3 → G4 → G5` 顺序完成数据库事实源、版本与 freshness、漫画版式、候选定稿返修和成稿出版。每个阶段由 Worker 子 Agent 实现，主 Agent 逐项审查；发现问题必须返工并重新验证，不能用规划完成、测试骨架或局部里程碑冒充整个 Goal 完成。

## 当前基线

- G0 已完成并提交：`185b83c`、`a7430b2`。
- G1 的方案、Schema 字典和验收清单已 accepted，但功能实现基本为 0。
- 当前 Prisma Schema 已按 r7 manifest 展开为 44 模型/556 scalar；0001～0008 纯计划、隔离 SQLite/Prisma E0 与签名 artifact-tree checker 已实现，但 2/2 前正式 migration 目录仍不得生成，runtime 尚未接线；项目、任务、对话、pending 和设置仍以 workspace/内存为事实源。
- G1 实施前发现旧 scoped ID 必然碰撞：不同项目都会产生 `chapter_001/shot_001/script_outline_current`。导入必须稳定重键，原 ID 通过 `ImportedEntitySource` 保留。

## 不可越过的安全边界

1. 自动实现和验证只使用带匹配 marker 的临时 workspace、临时 dataRoot 和 fake SecretStore。
2. 不读取、写入、迁移或删除真实 API Key；不向普通 JSON、SQLite、日志、任务或 artifact 写入 fake/真实 secret 明文。
3. M0–M3 可以在隔离环境实现、影子导入和演练；M4 正式停写、真实 snapshot、真实 Secret 迁移和正式 DB-only 激活必须在动作发生前再次取得用户明确授权。
4. 未授权正式切换不等于 Goal 完成；保持 Goal active，并继续完成所有不需要新授权的安全工作。
5. G0 文件态见证测试只有在 `WIT-01`（正式 importer → DB-only reopen）通过后才能删除或替换。

## G1 可执行切片

| 切片 | 主要交付 | 核心退出闸门 | 状态 |
| --- | --- | --- | --- |
| G1-0 安全夹具 | workspace/dataRoot/fake SecretStore 三根隔离、marker、环境清洗 | `ENV-01～04`，G0 全绿，真实目录 hash/mtime 不变 | `completed` |
| G1-1 M0-A/B | Prisma 6.19.3、44 模型、migration、UoW、JCS、约束、备份恢复 | `REV-00～06`、`SCH-00～15`、`DOC-01～03`、SQLite E0 | `in_progress_pass2_r7_rescrutiny` |
| G1-2 M1.1 | Project/Chapter/Script DB-only 临时垂直切片 | `REP-01～04` | `pending` |
| G1-3 M1.2 | Story/Storyboard/Preflight 文档、投影和 current 事务 | `DOC-04～09`、`REP-05～07` | `pending` |
| G1-4 M1.5 | Dialogue、ToolResult、runtime session、pending 持久化 | `REP-08～09` | `pending` |
| G1-5 M1.6 | SecretStore、OpenCode auth 分治、统一脱敏 | `SEC-01～11` | `pending` |
| G1-6 M1.7 | 持久任务、policy、claim/lease/fencing/cancel/recovery | `TSK-00～23` | `pending` |
| G1-7 M1.3/M1.8 | Character/Scene/Candidate/Asset staged+Outbox/删除 | `AST-01～08`、`OTB-01～05`、`DEL-00～05` | `pending` |
| G1-8 M1.4 | Layout/Export 兼容事实入库 | `LAY-01～06`、`EXP-01～06`；`REP-12` 只属于项目列表状态 | `pending` |
| G1-9 M2 | maintenance、snapshot、runtime bundle、严格 LegacyWorkspaceReader/importer | `MNT-01～04`、`SNP-01～05`、`RUN-01～05`、`IMP-01～20`、`IMP-05A` | `pending` |
| G1-10 M3 | 重复 fresh shadow、legacy 隔离、DB-only witness | `REP-10～11`、`SH-01～10`、`ACT-01～09`、`WIT-01` | `pending` |
| G1-11 M4–M6 | 正式切换、观察期、备份恢复、删除 file runtime | C0～C7、`RB-01～06`、`OBS-01～10`、Runtime/User Review；动作前用户明确授权 | `blocked_by_action_authorization` |

每个切片遵循：首条 Red 测试 → 最小 Green → 完整矩阵 → Worker 自检 → 主 Agent 静态审查 → 问题返工 → 运行复核 → 文档/提交。不得并行修改同一核心文件所有权。

## G2 至 G5 阶段

| 阶段 | 交付 | 开始条件 | 状态 |
| --- | --- | --- | --- |
| G2 | Working Copy、不可变正式版本、SourceSnapshot、freshness 与任务适用性 | G1-10 `WIT-01` 临时 DB-only substrate 通过并签收；不等待生产 M4 | `pending` |
| G3 | 创建时必选 `vertical_scroll/paged_comic`、创建后不可变、旧值迁移 | G2 通过 | `pending` |
| G4 | CandidateLockRevision、影响预览、返修与下游 stale | G3 通过 | `pending` |
| G5 | LayoutDocument 编辑器、版本、预检、确定性 `layout_publication` | G4 通过 | `pending` |

## 角色与审查

- Orchestrator（主 Agent）：事实源、计划、文件所有权、审查、返工、阶段签收、Goal 状态。
- Worker：只执行当前切片，报告修改文件、命令、证据和风险。
- Scrutiny Review：只读审查契约、约束、测试、秘密边界、回滚与 Handoff。
- Runtime/User Review：在临时环境验证真实路径；正式数据路径只在获得动作级授权后执行。

## 当前下一步

1. r1～r6 共 28 份 review evidence 均已冻结并逐项复算；r6 sealed file SHA-256=`298378e9f9fe891d86627c6e0df6e4b36fcb71de62a95e3a46ea604f12b42333`，final bundle=`sha256:1ec86bc4a83a54c4f91c408d190c82c513cb29ba157b8c7282585890b0bfc534`，只作旧摘要历史。
2. r6 SQLite Reviewer 的两项 P1（FK 物理名未按公式逐项证明、Schema/migration renderer/CLI 未进入摘要）以及父级增量审计发现的 FK-mode、全行复制等价、Schema 写门禁、artifact-tree freshness、verifier FK 启用和 fresh ledger scope 均已在 r7 收口。
3. current source 精确为 `23 = 20 TypeScript + 2 Markdown + apps/server/package.json`，相对本地 import/require 必须闭包；manifest digest=`sha256:c32dd95ab61a2d8a89c25dbab45d0f3efb7323d504f6031dc2e51e38b5943d06`，Schema 逐字 check 与 Prisma validate Green。
4. 纯计划返回 migration lock + 0001～0008；marker-owned SQLite 双重 replay、同计数值改写/FK-mode/orphan 负例，以及真实 Prisma 6.19.3 `8 success → no pending`、`P3018 rollback → P3009` 均 Green。Schema/migration write 和 migration artifact check 都要求 current derived 2/2；正式 migration 目录仍不存在。
5. current round/root 为 `g1-m0a-pass2-r7`，真实 root absent、derived gate=`0/2 pending false`。下一步由两名独立 Reviewer 对 current digest 重做契约与 SQLite/DSL 复核，父 Orchestrator CAS sealing；2/2 accepted 后才运行正式 Schema/migration materializer 与 tree check。
