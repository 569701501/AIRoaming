---
doc_id: AIR-TASK-20260721-CLEANUP-CLOSEOUT-FINDINGS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: package scripts、静态 import 图、Nest 装配、Web 调用与恢复契约
---

# 发现

## 审计口径

“标准 DB-only 不走”只证明不是日常业务路径；还必须排除正式 CLI、迁移恢复、历史解码和有效测试责任，才能判定为遗漏死代码。

## 候选矩阵

| 候选 | 生产入口 | 恢复/历史责任 | 有效测试责任 | 结论 |
| --- | --- | --- | --- | --- |
| G1 Schema/迁移计划生成器与 DSL | 无 | 冻结 manifest 已足够保留 provenance | 专用测试只验证已退役生成器 | 已删除 |
| 旧整本覆盖导入、项目 reset/impact preview | 无标准用户入口；DB-only 永远拒绝 | 0017 新双流程已替代写入 | 旧测试只保护被替代入口 | 已删除 |
| callback `CutoverCoordinator` | 无；正式 runner 不调用 | `DbCutoverService + CutoverEvidenceStore` 已覆盖 | 测试与正式切换重复 | 已删除 |
| `legacy-layout-format.ts` 与旧 versioning contract | 无 import、无动态装配 | 无 | 无不可替代基线 | 已删除 |
| `ProjectStats.vue`、`WorkflowStrip.vue` | 无路由/组件引用 | 不适用 | 无 | 已删除 |
| 旧 `lockChapterCandidate` file facade | 新 G4 `CandidateDecisionService` 已替代 | 无历史读责任 | 新两阶段锁定测试覆盖 | 已删除 |
| 同步参考图、批量 preview ensure facade | 无 Controller/Web/worker 调用 | 异步任务路径已替代 | 仅旧 service 测试可达 | 已删除 |
| readiness wrapper、maintenance/evidence 查询/注册辅助 | 无 CLI/Nest/runner 调用 | ledger/正式 evidence API 已替代 | 仅自测自身 | 已删除 |
| migration overlay contract、runtime ledger assert | 正式 runtime/测试门禁按文件不同 | 校验发布 migration 与恢复数据库 | 是 | 保留 |
| `business-write-boundary.registry.ts` | 静态测试门禁读取 | 防止新业务绕过事务入口 | 是 | 保留 |
| `PersistentTaskWorkerService.setHandler` | 测试注入点 | 不适用 | 15 处 worker 测试 | 保留 |
| `SecretString.toJSON` | JSON 隐式协议调用，静态引用为 0 是正常现象 | 防秘密泄露 | 间接覆盖 | 保留 |
| `ProjectDeleteOutboxService.purgeDeletedProject` | 当前未找到标准运行时直接调用 | 是删除事务最后一步，不能丢 | 2 个 DB 集成测试 | 保留并列为运行时接线风险 |
| Story/Storyboard/Preflight file fallback | file E2E 与兼容分支仍可达 | file 数据/恢复兼容 | file E2E 4/4 | 不可零散删除；需单独整体退役决策 |

## 体量结论

- Server TypeScript 当前 354 个文件、76,376 行；其中 227 个非 spec 文件 52,146 行，127 个测试文件 24,230 行。
- Web TS/Vue 为 42 个文件、22,730 行；样式另有 2,981 行。Shared 为 67 个文件、14,042 行。
- 因此“后端 7.6 万行”包含约 2.4 万行测试；生产后端与前端代码的差距约为 2.3 倍，而不是 3～4 倍。差额主要来自 SQLite 事务/版本化、持久任务、Provider、备份恢复、migration/import、Outbox 和 CLI，不应再靠保留第二套生成器扩大。

## 数据库与 trigger

- fresh 部署：53 张业务表（另有 `_prisma_migrations`）、242 个有效 trigger、0 个 view、17 个 migration。
- migration 文本累计出现 248 次 `CREATE TRIGGER`，但 overlay 会先 drop/replace，最终 live trigger 为 242。
- trigger 按约束族保护 scope、不可变版本、current pointer、状态迁移、任务租约、Outbox、资产激活与防回退；生成器退役不意味着这些运行时不变量可删除。

## 新发现但不属于死代码

1. 项目删除流程为 `active -> deleting -> project.delete_files processed -> DB purge`，但标准启动未发现通用 Outbox 后台消费者或最终 purge 调度。`purgeDeletedProject` 不能删除；应另建功能任务补齐调用和失败可见性。
2. DB E2E 的固定结构假 provider 原先返回旧 Markdown JSON，而 OpenCode 改造消费 `info.structured`；同日已补齐 `json_schema` 假响应与回归测试。
3. 候选图 E2E 原先使用整场累计 provider 请求断言，前序图片用例会污染；同日已改为只审计用例内新增请求。
4. Web 构建仍提示 AppShell chunk 约 1.0 MB（gzip 约 328 KB），属于前端性能/拆包风险，不是死代码证据。

## 最终结论

按四项判死标准，没有发现尚可安全删除的明确死代码。剩余大块要么是现行数据库/恢复/测试责任，要么需要“整体退役 file runtime”或“补齐删除 worker”这样的独立架构任务，不能通过零散删文件处理。
