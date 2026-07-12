---
doc_id: AIR-G2-F3-HANDOFF-001
status: ready
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F3 completion evidence
---

# Handoff

F3 已闭合 `story_parse` / `shot_generate` 的 DB worker completion 链。后续阶段应复用 `PersistentTaskWorkerService` 的 completion seam，不在新 worker 内直接更新任务状态或版本 current 指针。

## 下一步

- 为 `shot_prompt_generate` / `image_generate` 建立对应 source projection、strict codec、provider handler 和 completion policy。
- 把 enabled G2 task creation 的 expected target/source 校验从调用方补到 DB API 的统一 create gate。
- 在真实 OpenCode 服务配置下做一次 provider smoke test，并保留 deterministic handler 回归测试。
