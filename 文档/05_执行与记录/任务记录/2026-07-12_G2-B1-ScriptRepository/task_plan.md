---
doc_id: AIR-G2-B1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2施工包与当前代码库
---

# G2-B1 ScriptVersion Repository 任务计划

## 目标

在 G2 数据库 Overlay 已部署的前提下，完成 Script Working Copy 与 ScriptVersion 的最小闭环：读取、CAS 更新、清空、回退、发布、AI pending adopt/discard、历史读取与复制，并通过新的 DB-only 路由提供稳定契约。保留 G1 文件模式和旧接口，不提前实现 Story/Storyboard/Preflight。

## 阶段

1. 冻结 Shared Script API 类型与数据库错误码。✅
2. 实现 `ScriptVersionRepository` 及事务内 CAS/幂等语义。✅
3. 接入 ScriptVersion API facade 与 ProjectsController 新路由。✅
4. 使用 fresh SQLite 验证发布、回放、冲突、重启读回与历史复制。✅
5. 完成静态复核、handoff、任务记录和长期记忆同步。✅

## 退出标准

- 所有 Script 写路径只在 DB 模式执行；文件模式继续走 G1 旧实现。
- 更新、清空、回退、发布和 pending adopt 均有 rowVersion/digest CAS；同一请求重放不重复写版本或下一章。
- 发布只改变 Script 当前指针、Working Copy 和兼容的 pending Story 归档，不写入 Story/Storyboard/Preflight confirmed/current 数据。
- fresh SQLite、类型检查、现有全量测试与 `git diff --check` 通过。
