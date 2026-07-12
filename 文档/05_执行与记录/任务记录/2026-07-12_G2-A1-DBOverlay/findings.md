---
doc_id: AIR-G2-A1-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-A1 代码探索与验证
---

# Findings

## 当前事实

- G1 的 `apps/server/prisma/migrations/0001_*` 至 `0008_*` 与 manifest/checksum 测试形成封闭基线；任何 package script 或 G1 migration 修改都会改变 G1 source closure。
- `Chapter` 已有 working copy、current/pending 上游指针和 `rowVersion`；`StoryVersion`、`StoryboardVersion`、`PreflightRevision`、`Shot`、`GenerationTask` 由 G1 schema 提供，G2 只需 overlay 约束。
- SQLite BEFORE UPDATE trigger 不能用 PostgreSQL 风格直接赋值 `NEW.row_version`，因此 A1 用“要求调用方显式提交 OLD+1，否则拒绝”的等价门禁，并在 repository 契约中固定该要求。
- G1 已有 GenerationTask source-set seal 和 Preflight JSON/来源约束；A1 不复制长校验，只补 G2 可证明的上游状态门禁。
- 正式 Prisma migration tree 现在包含 0001–0009；G1 运行时 ledger 仍只验证原八行，并显式忽略已知的 G2 0009。完整九行严格校验由 `g2-runtime-migration-ledger.ts` 提供，A1 不把 G2 capability 混入旧 Projects API。

## 风险

- SQLite 触发器无法自行计算 SHA-256；确认版本的 digest 等值由应用层 snapshot builder 负责，数据库层只检查关系与非空/格式。
- G2 ledger 在 A1 只作为独立 helper，未接入启动门禁；完整 API 命令完成后再由专门阶段接入并补 runtime evidence。
- `trg_g2_generation_tasks_new_work_gate_seal` 只实现 SQLite 能机械证明的 routing/source 基础条件；SourceSnapshot digest、expected rowVersion、current/historical 的完整业务判定仍由 B/C1/D1 的 repository transaction 负责。
