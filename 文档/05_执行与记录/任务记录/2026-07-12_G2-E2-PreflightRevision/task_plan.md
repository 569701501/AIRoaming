---
doc_id: AIR-G2-E2-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E2 上游版本链方案与当前 DB substrate
---

# G2-E2 PreflightRevision 任务计划

## 目标

在 D1 Storyboard current 的基础上实现服务端 Preflight live preview、聚合 SourceSnapshot、严格 V2 document 和不可变 `PreflightRevision` confirm/current 指针；确认后不原地修改旧 revision，Storyboard 新 current 会派生旧 Preflight stale。

## 阶段

1. 读取 Preflight codec、SourceSnapshot、0009 current trigger 和既有出图准备规则。✅
2. 实现 DB scoped `SourceSnapshotBuilderService`：Storyboard、Character/Visual/Asset、ChapterScene/Visual、Project style。✅
3. 实现 `PreflightRevisionRepository/Service` 的 preview、expected source confirm、replay 和 current pointer。✅
4. 接入 preview/confirm API，保留旧 file-mode ImagePreflight 路径。✅
5. fresh SQLite 验证 ready preview、immutable confirm/replay、重启可读和 Storyboard 变更后的 stale。✅
6. 完成 Scrutiny、Runtime 边界、handoff、完成记录和长期记忆同步。✅

## 非目标

- 不实现持久 worker、TaskApplicabilityGuard、Candidate、Layout/Export、Capability switch。
- 不为测试新增 Visual/Asset 权威表；只读 G1 已有关系和可选 visual/asset。
- 不把旧 file-mode `ImagePreflightService` 改成双写；DB API 与旧路径保持隔离。

## 退出标准

- preview 和 confirm 使用同一事务前重建的 sourceDigest；source 变化返回 `PREFLIGHT_SOURCE_CHANGED`。
- confirm 只插入 confirmed revision，并用 Chapter rowVersion CAS 切 current；重复请求可 replay。
- blocked issue 不得插入 ready revision；ready revision 满足 0009 trigger。
- 全量测试、类型检查、G1 checks、git diff check 和文档复核通过。
