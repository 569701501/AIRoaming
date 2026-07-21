---
doc_id: AIR-TASK-20260721-FILE-MODE-CLEANUP-SCRUTINY
status: passed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: Worker 完成后的只读静态复核
---

# Scrutiny Review

## 结论

`passed`。未发现阻塞交付的静态问题。

## 复核项目

| 项目 | 结论 | 证据 |
| --- | --- | --- |
| 删除项是否仍有生产调用 | 通过 | 全仓搜索无 `resetProjectScript`、`getScriptImpactPreview`、旧 coordinator 代码引用 |
| 正式 cutover 是否被误删 | 通过 | `db:cutover` 仍由 `DbCutoverService + CutoverEvidenceStore + cutover-runner` 承担，full runner 回归通过 |
| 恢复能力是否受损 | 通过 | backup/restore/archive/final importer/activate 均保留；M6 真实隔离演练通过 |
| capability registry 是否漂移 | 通过 | 源码门禁扫描与 32 项 registry 精确一致，13/13 定向测试通过 |
| API/共享类型是否残留 | 通过 | TypeScript/Vue typecheck 与全仓引用检查通过 |
| 数据库是否被改写 | 通过 | Prisma Schema 与 migration 无改动；fresh 0001～0017 deploy 成功 |
| 无关工作树改动是否被覆盖 | 通过 | OpenCode/对话质量等既有修改仍保留，本轮只在目标 hunk 上收缩 |

## 非阻塞观察

- file fallback 仍占据一部分 Projects/Dialogue 代码，但目前仍被 file-mode 集成测试调用，不能归类为零调用死代码。
- 242 个有效 trigger 是明显的复杂度信号，但当前承担数据库不变量；后续应按约束族评估合并，而不是按数量直接删除。
