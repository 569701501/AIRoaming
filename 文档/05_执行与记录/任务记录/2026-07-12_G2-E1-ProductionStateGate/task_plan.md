---
doc_id: AIR-G2-E1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E1 施工资料与当前代码库
---

# G2-E1 ProductionState/Workflow/NewWorkGate 任务计划

## 目标

在 C1 Story、D1 Storyboard 已完成的 DB substrate 上，新增服务端权威的 ChapterProductionState/Workflow 查询和 NewWorkGate 检查。E1 只负责版本链派生与任务创建前门禁，不实现 Preflight 完整视觉聚合、持久 worker、TaskApplicabilityGuard、history 或 capability switch。

## 阶段

1. 读取 E1 相关架构、API、Overlay、版本链契约，冻结 DTO 与操作边界。✅
2. 扩展 Shared Workflow step 状态字段和 production-state 查询响应类型。✅
3. 实现 `ChapterProductionQueryService`：scoped Chapter rows → shared resolver → DB Workflow projection。✅
4. 实现 `NewWorkGate`：按 `story_parse/shot_generate/shot_prompt_generate/image_generate` 检查 source、pending、target 和 Preflight 条件；接入 production-state API。✅
5. fresh SQLite 验证 current/pending/stale、reasonCodes、gate allow/reject、重启读回。✅
6. Scrutiny、Runtime/User Review 边界说明、handoff、完成记录和长期记忆同步。✅

## 非目标

- 不实现 `story_parse/shot_generate` worker 或通用持久 worker。
- 不实现 PreflightRevision 生成、角色/场景视觉聚合、Candidate/G4、Layout/G5。
- 不删除 G1 file-mode 或旧 Story/Storyboard API，不切换全局 capability。

## 退出标准

- 同一 DB 查询同时返回 productionState、workflow、chapterRowVersion；前端无需按 `Chapter.status` 猜测 freshness。
- pending/dirty/缺来源/stale 的 reasonCodes 可解释，Workflow 状态能区分 `needs_confirmation`、`needs_update`、`blocked`。
- NewWorkGate 对四类 G2 任务拒绝不满足 source/pending/target/Preflight 条件的请求，并返回稳定 `UPSTREAM_WORK_NOT_CONFIRMED` 与 reasonCodes。
- fresh SQLite、全量测试、类型检查、migration/manifest 检查和文档复核通过。
