---
doc_id: AIR-G3-M3-A15-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 对话模型契约、runtime bundle v1 与 M0 维护封口
---

# G3-M3-A15 对话运行态导入计划

## 目标

让 maintenance 在有明确运行态 provider 时封存可验证对话快照，并把 `captured=true` 的线程、消息、工具结果和旧 runtime session 导入数据库只读历史。

## 边界

- 只导入 runtime bundle 明确标记 `captured=true` 的 conversationState；M0 默认 deferred bundle 不创建任何对话实体。
- assistant 旧 running 消息收敛为 failed；旧 OpenCode session 以 closed 历史保存，不恢复为 active runtime。
- pendingDialogueState 仍保持明确 deferred；不从子 service pending Map 猜造 PendingDialogueArtifact。

## 退出标准

- `--slice dialogue` 校验 runtime bundle digest，支持稳定 sourceKey/target ID、scope/FK、工具结果和 replay。
- 集成测试覆盖 captured 对话、closed session、deferred 零实体和重放。
- typecheck、server 全量回归、G1 三项门禁和 diff check 通过；M4 仍保持 `in_progress`。
