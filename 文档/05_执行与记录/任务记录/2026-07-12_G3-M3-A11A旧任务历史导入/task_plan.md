---
doc_id: AIR-G3-M3-A11A-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G1 GenerationTask legacy shape 与 G3-M3 导入顺序契约
---

# G3-M3-A11A 旧任务历史导入计划

## 目标

读取 sealed snapshot 中 `projects/{projectId}/tasks/*.input.json` 及其 output/error 证据，将旧任务写成不可执行的 `legacy_imported` 或 `legacy_stub`。

## 边界

- `legacy_imported` 只在 input 与 output 均可验证时使用；缺 output 或 input 不完整时使用 `legacy_stub`。
- 所有旧任务固定 `retryDisabled=true`、`maxAttempts=0`、`attempt=0`、非 running，不能进入 runtime claim/retry/cancel。
- 旧 taskId 通过 stable sourceKey 映射；input/output/error 只保存快照中可验证且经过凭据脱敏的 JSON。
- 本切片不导入 Candidate、Lock、Layout/Export，也不把旧任务重新排队执行。

## 退出标准

- 集成测试覆盖完整 artifact、缺 output stub、chapter FK、replay 零新增。
- typecheck、server 全量测试、G1 三项门禁和 diff check 通过。
