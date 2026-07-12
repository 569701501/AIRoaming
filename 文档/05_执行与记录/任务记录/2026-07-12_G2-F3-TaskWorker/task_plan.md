---
doc_id: AIR-G2-F3-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F3 implementation
---

# 目标

把 F2 的持久化 claim substrate 接到 `story_parse` / `shot_generate` 的 provider、completion applicability 和 pending version apply 事务。

# 退出标准

- worker 具备 claim、heartbeat、provider、strict output、finish 的可调用循环。
- current 任务更新 pending version 与 projections；过期任务只记录 historical，不覆盖 current/pending。
- task detail 可读取 Attempt 历史；fresh SQLite 集成覆盖两类任务。

# 非目标

本阶段不启用 `shot_prompt_generate` / `image_generate` 的 DB worker，不执行真实外部模型验收，不改变 G1/G2 schema。
