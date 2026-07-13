---
doc_id: AIR-D2-A3-2A-SCENE-WORKER-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: SceneVisual worker
---

# Findings

- G1 SceneVisual trigger 要求同 ChapterScene、同 chapter/project 的 ready Asset；worker 复用现有约束。
- `ChapterScene` 目前只有 sceneKey/currentVisual，公开 queue 还需要稳定 Story/Scene projection 绑定，不能只凭旧文件 sceneId 放行。
