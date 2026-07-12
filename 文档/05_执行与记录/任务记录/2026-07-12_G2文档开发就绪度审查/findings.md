---
doc_id: AIR-TASK-20260712-G2-DOC-READINESS-FINDINGS
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2 文档与当前代码只读对照
---

# Findings

## 已确认

- G2 的产品语义、四层版本链、Working Copy/current/pending/freshness 术语和用户语言已经相当完整。
- 当前正式 Schema 已包含 Chapter、StoryVersion、StoryboardVersion、PreflightRevision、GenerationTaskSource 等目标实体和多数基础字段。
- 当前 DB runtime 只接通 Project/Chapter/Script 三类写入；Story/Storyboard/Preflight、持久任务与 importer 尚未形成可执行生产链。

## 开发就绪度结论

现有 G2 文档属于“详细的设计与验收规格”，但还不是“另一个开发模型可以整包无监督执行的施工包”。

| 维度 | 结论 |
| --- | --- |
| 产品语义、版本链、用户语言 | 高度完整 |
| Codec、摘要、Freshness、事务原则 | 较完整 |
| Schema 基础实体 | 已具备 |
| G2 overlay 的精确 migration/trigger | 未闭合 |
| 文件级改动图、Repository 与事务所有权 | 未闭合 |
| 全量 API/DTO、兼容与幂等 | 部分闭合 |
| Task/importer/重启等验收前置 | 当前代码不具备 |
| 可执行 fixture、barrier 和命令 | 仍是模板 |

最终判定：**G2-A/G2-B 可在补一份窄实施说明后开发；完整 G2 不应以一句“按文档全部实现”直接交给 5.6 Luna。**

## 关键证据

### 1. 完整 G2 验收依赖尚未实现的 G1 子系统

- G2 验收要求 lease、claimToken、迟到 worker、取消与进程重启，并包含完整 importer 用例。
- 当前 `TasksService` 仍以内存 `Map` 保存任务，创建后直接运行注册 worker 或 mock worker。
- 模块事实源明确记录持久任务、lease/heartbeat、重启恢复和旧任务导入均未实现。
- G1 完成记录也明确当前只完成 Project/Chapter/Script 最小 DB 切片，Story/Storyboard/Preflight、Task/Attempt/lease、Asset/Outbox、import/cutover 尚缺。

影响：若要求 Luna 一次完成 G2-F，它必须额外实现一大块 G1，或跳过 G2-TASK/G2-MIG 验收；现有文档没有把这一扩展范围拆成可验收施工任务。

### 2. G2 overlay 只有所有权描述，没有精确数据库施工清单

- 契约列出了 active pending、rowVersion/CAS、NewWorkGate、V2 confirm 等约束要求。
- 当前 Schema constraint source 中 G2 仍是概念占位：`G2 version/freshness overlay checks`、`G2 one-active-pending uniqueness indexes`、`G2 ... triggers`。
- 未冻结 migration 名称/顺序、精确 CHECK/INDEX/TRIGGER 表达式、表重建策略、预期对象数量和 checker 接入点。

影响：实现模型必须自行发明最关键的 SQLite 并发和不可变约束，容易出现“测试通过但契约不同”的分叉。

### 3. 深模块职责已命名，但工程 seam 未闭合

- 文档已经定义 `DocumentCodecRegistry`、`SourceSnapshotBuilder`、`ChapterProductionStateResolver`、`NewWorkGate`、`TaskApplicabilityGuard`，这一层是清楚的。
- 但没有给出文件级变更图、Repository 拆分、Unit of Work/事务所有权，以及现有四个领域门面如何从 file runtime 迁入 DB runtime。
- 当前 `ProjectRepository` 只接受 `create_project/save_chapter_draft/complete_chapter`，并显式拒绝 Story/Storyboard/Preflight 状态及 DB 读回。

影响：Luna 必须自行决定继续扩大现有大 Repository，还是建立版本仓储与事务协调层；该决定会直接影响并发、回滚和可测试性。

### 4. API/DTO 只闭合了主干，不足以机械实现全部交互

- Script PATCH/publish 和 Story confirm 的并发字段较完整。
- Story Working Copy 的 POST/PATCH/DELETE body/response、patch 语义、创建幂等未逐项定义；Storyboard 仅写“与 Story 同构”。
- 历史只规定四层需要列表/详情，没有冻结路径、分页、排序和 DTO。
- 新 Shot 规定由服务端分配稳定 ID，但未定义请求重放 token、丢响应后如何取回同一 ID。
- 当前共享 DTO 与 Controller 仍是旧的 whole-document confirm/update 路由，没有 expected current/digest/rowVersion。

影响：模型能写出 API，但无法保证前后端、重试、兼容路径和错误语义唯一。

### 5. 版本号、Stable Shot ID 与丢响应幂等算法未冻结

- 文档定义版本单调不复用、Shot retired 不复活，这是正确的领域规则。
- 未指定并发创建 pending 时的版本分配算法、唯一冲突重试、命令 idempotency key，以及 Story/Storyboard confirm 丢响应后的精确重放结果。

影响：这是必须由项目冻结的持久化语义，不应留给不同实现模型自由选择。

### 6. 验收清单很全，但测试基础设施仍是设计稿

- G2 QA 已列出四个 provider barrier 和 12 个任务故障场景，覆盖面很好。
- 当前仓库没有这些 barrier 的可执行 harness；fixture 主要是状态描述而非 seed/builder/expected rows。
- 验收模板中的 `prisma:migrate:replay:test` 当前不存在，文档本身也要求 G2-A 先固化脚本。

影响：若不先给出测试 harness 施工范围，模型可能再次把大量时间花在自建流程基础设施上，而不是先完成垂直业务切片。

## 必须先补的实施资料

1. **依赖边界表**：明确 G2 每个切片依赖哪些已存在能力；持久 Task/importer/Asset 是前置、由 G2 实现还是暂缓验收。
2. **精确 overlay manifest**：migration 序号、表/字段变更、完整 CHECK/INDEX/TRIGGER、预期对象与直接合同测试。
3. **文件与事务地图**：新增/修改文件、领域门面、Repository、事务所有者、file 兼容边界，禁止继续把所有版本事务堆入单一 Repository。
4. **完整 API/DTO/幂等表**：旧路径到新路径的兼容、所有 request/response、历史分页、版本/Shot ID 分配、重放语义和错误码。
5. **可运行验收包**：临时 DB seed/builder、fake-provider barrier、真实脚本名、每切片最小命令与证据目录。

## 推荐交付顺序

1. `G2-A0`：Codec/JCS、SourceSnapshot、Freshness Resolver 和共享 DTO，先做纯逻辑/golden tests。
2. `G2-A1 + G2-B`：只打通 Script Working Copy/publish 的 DB 垂直切片，包含 CAS、回滚和重启读回。
3. `G2-C`：Story pending/confirm；随后 `G2-D` Storyboard 与 stable Shot ID。
4. `G2-E`：Preflight、workflow、NewWorkGate。
5. 只有持久 Task 与 importer 前置真实具备后，才关闭 `G2-F` 的迟到 worker、lease、restart 和 migration 验收。
