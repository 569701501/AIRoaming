---
doc_id: AIR-TASK-20260721-0017-CLEANUP-FINDINGS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 0017 Schema、迁移、生产代码和运行数据库
---

# 发现

## 需求理解

用户希望继续清理“迁移已经完成后仍遗留”的后端代码，并特别核实 0017 的表和触发器是否仍有必要。

## 已确认事实

- 0017 新增 9 张双流程表和 20 个约束触发器。
- 当前正式契约和生产代码都把这些表用于已有剧本导入和 AI/import pending 来源追溯。
- 标准数据库表为空不能证明无用；fresh SQLite 和 DB-only 浏览器路径均能真实写入并读取它们。

## 表与调用矩阵

| 表组 | 生产入口 | 结论 |
| --- | --- | --- |
| RawSource Version/Document/Block | `createRawSource/getRawSourceContext`，B1/B2 长稿分层 | 保留 |
| AnalysisCandidate/ChapterMap | `createAnalysisCandidate/confirmAnalysisCandidate`，B2/B3 | 保留 |
| ImportBatch/Item | `startImportBatch/beginImportItem/recoverInterruptedImportItems/getImportBatchProjection`，B3/B4 worker/重试 | 保留 |
| FidelityReport | `recordImportFidelity`，B4 verify | 保留 |
| PendingSourceBinding | `createAiChapterPending/recordImportFidelity/confirmImportPending`，A4/B4/B5 | 保留 |

## Trigger 责任矩阵

| 组 | 数量 | 责任 | 结论 |
| --- | ---: | --- | --- |
| RawSource 三层 | 6 | active scope、跨表 ref 一致、不可变 | 保留 |
| Analysis/Map | 4 | 内容不可变、单向状态、digest/JSON 确认边界 | 保留 |
| Batch/Item | 4 | scope、CAS、状态机、正式版本同章同 digest | 保留 |
| Fidelity | 2 | 当前 attempt/candidate 绑定、不可变 | 保留 |
| Pending shape/binding | 4 | kind/policy、一次密封、投影一致、来源角色白名单 | 保留 |

## 删除证据

- `script-import.util.ts` 只被 `ChapterScriptService` 的两个旧方法调用。
- 两个旧方法只被 `ProjectsService` 薄门面调用；仓库内没有控制器、当前 Dialogue、Web、迁移或恢复调用。
- DB 模式原行为只是拒绝 `import_script_to_chapters`，capability registry 的一项只证明这个旧方法还存在。
- 当前 B1～B5 已由严格模型输出、不可变来源、目录确认、后台批次、忠实度和逐章确认完整替代。

## 风险

- 误删表或触发器会让已有剧本导入、逐章确认或来源不可变约束在新项目第一次使用时失败。
- 当前工作树存在用户的 OpenCode、剧情结构、项目来源仓储等未提交修改，实施时必须避免覆盖。

## Scrutiny Review

passed：静态引用清零；0017 每张表均有生产读写或恢复责任；20 个 trigger 均有约束责任；历史只读兼容没有被误删；Schema、migration 和标准库字节未修改。聚焦与全量验证覆盖类型、构建、Prisma、仓储重启、DB 主集成和备份恢复。

## Runtime/User Review

passed：隔离 DB-only Chromium B1～B5 真实执行上传/分析、整本目录确认、后台逐章处理、只读 pending 和逐章正式发布，1/1 通过；使用 fake provider，无真实模型或图片费用。标准数据库只做只读状态、表数、trigger 数、完整性和外键检查。
