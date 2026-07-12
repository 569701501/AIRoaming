---
doc_id: AIR-TASK-20260712-RELEASE-SCHEMA-HANDOFF
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、progress.md、scrutiny_review.md
---

# Handoff：发布 Schema 身份解耦

## 已完成

- 新增独立 release Schema identity：只绑定 SQLite、`schema.prisma` checksum 与全部有序 migration SQL checksum；当前精确包含 0001～0010。
- identity 不读取 package.json、importer、CLI 或 G1 generator 源码；新增有序 migration 会自动改变 identity。
- Luna M4 verifier/CLI 已保留并改用 release identity；单次 succeeded shadow 的只读验证通过。
- G1 source closure 移除完整 package.json，从 19 份收窄为 18 份；Prisma 6.19.3 继续由独立 schema contract 测试锁定。
- `schema.prisma`、0001～0010 migration SQL 与其中 trigger 字节未改变。
- G3-M 交接文档已按 Git 历史修正到 A11C，并把 M4 标为 `in_progress`。

## 明确未完成

- M4 尚未完成双 fresh shadow、API DTO/Asset hash 等价和按 entityType 重算复合来源摘要。
- M3 仍缺 Layout/Export、Dialogue/provider、完整 read-model/orchestration；`--kind final` 继续 fail-closed。
- backup/restore、capability gate、真实 DB-only activate 未实现也未获本任务授权。
- 本轮不合表、不删 trigger、不新增 migration；Task 三个 materialize trigger 保持不动。

## 后续接续点

1. 完成 full importer 缺口，不扩展 G1 大生成器。
2. M4 建立来源证据注册表：每个 entityType 明确 contributing storage keys 与 digest 算法，再完成双 fresh shadow 验收。
3. 0011+ 使用小 migration + 小 contract；同步显式 runtime migration catalog。release identity 会自动纳入新目录，但这不等于 runtime 自动放行。
4. full shadow 两轮通过、final cutover 前执行投影读取点审计；DB-only 稳定后再小批评估低风险 scope trigger。

## 工作树边界

- 本任务整合 Luna 原有未提交的 `db:verify` script、CLI、Service 和特征测试。
- 既有 12 张截图删除不是本任务改动，未触碰、不得随本任务提交。
