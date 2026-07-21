---
doc_id: AIR-TASK-20260721-FILE-MODE-CLEANUP-HANDOFF
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 本轮实现差异、调用图与验证结果
---

# Handoff

## 已完成

- 删除无运行责任的 G1 Schema/迁移计划生成器源代码与对应生成器测试；保留发布 Prisma Schema、0001～0017 migration 和运行时账本校验。
- 删除已被 DB 双路线导入取代的旧整本剧本分析/覆写链。
- 删除项目级 `script/reset`、`script/impact-preview`、前端未调用包装、共享响应 DTO、目录物理清理助手和对应 capability operation。
- 将 M6 真实隔离演练迁移到正式 `CutoverEvidenceStore`，删除无生产入口的 callback 版 `CutoverCoordinator` 与重复单测。

## 明确保留

- `DbCutoverService`、`CutoverEvidenceStore`、`cutover-runner`、snapshot/final importer/ready/activate。
- backup/restore、metadata archive、file bridge guard 和 Asset 受控文件写入。
- 0001～0017 历史 migration 以及新鲜数据库中的 242 个有效 trigger。

## 协议影响

- 删除 `POST /api/projects/{projectId}/script/reset`。
- 删除 `GET /api/projects/{projectId}/script/impact-preview`。
- 删除 `ResetProjectScriptResponse`。
- 数据库、Prisma Schema、migration ledger 和现有业务数据无变化。

## 验证摘要

- workspace typecheck：通过。
- workspace build：通过；仅保留既有 Web chunk size warning。
- Prisma validate：通过。
- capability/source guard：13/13 通过。
- Project DB-only A2 定向：2/2 通过。
- M6 真实隔离演练：2/2 通过。
- Shared 全量：168/168 通过。
- Server 全量并发：759/760 通过；唯一 `RST-02` 在固定 5 秒门限下超时，隔离复跑 1/1、4.395 秒通过。
- `git diff --check`：通过。

## 后续边界

- 若要继续删除 Story/Storyboard/Preflight 的 file fallback，必须作为“显式 file runtime 与 file E2E 整体退役”单独处理，不能只删半条调用链。
- 若要减少 trigger，必须新增架构决策、forward-only migration、等价约束证明和性能基准；不得改写 0008 或直接从现有库删除。
