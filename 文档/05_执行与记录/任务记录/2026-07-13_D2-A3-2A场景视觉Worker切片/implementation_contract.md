---
doc_id: AIR-D2-A3-2A-SCENE-WORKER-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: SceneVisual worker
---

# 实施契约

- task target 为 `scene`，必须携带 projectId/chapterId/sceneId 与 `chapter_scene` source projection。
- Asset 先 staged 后 ready，记录 sha256、bytes、MIME、尺寸和 sourceTaskId；SceneVisual 版本按 ChapterScene 单调递增。
- source digest 变化的迟到任务只保留历史 SceneVisual，不切 currentVisual。
- 不写 legacy story structure、真实 provider、真实凭据或真实 workspace。
