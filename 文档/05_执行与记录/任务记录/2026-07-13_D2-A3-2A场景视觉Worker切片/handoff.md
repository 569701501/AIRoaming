---
doc_id: AIR-D2-A3-2A-SCENE-WORKER-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent, qa
source: P4 SceneVisual contract
---

# SceneVisual worker

DB 持久 worker 已支持 `scene_reference_generate` 的 fake-handler 验证：任务 claim 后写 staged Asset、ready Asset、SceneVisual，并在 source digest 仍匹配时切换 `ChapterScene.currentVisualId`。

公开 `queue_scene_reference` 仍保持 DB guard 阻断，待完整 Story/ChapterScene source projection 接入后再开放。
