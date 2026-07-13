---
doc_id: AIR-D2-A3-2A-SCENE-QUEUE-CONTRACT-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: 场景参考任务持久化 Handoff
---

# 实施契约

| 项目 | 契约 |
| --- | --- |
| 入口 | `ProjectsService.queueSceneReference(projectId, chapterId, sceneId, input)` |
| DB source | `ChapterScene(id, projectId, chapterId, sceneKey, updatedAt)` |
| task type | `scene_reference_generate` |
| target | `{ type: "scene", id: ChapterScene.id, chapterId }` |
| source policy | `scene-reference-source-v1` |
| 幂等 | PersistentTaskRepository 按冻结 source/input replay |
| provider | 仅 worker handler；测试 fake handler；公开 queue 不触碰 provider |
| 文件模式 | 继续 legacy route guard，不改变旧行为 |

source digest 必须包含 scene 行身份、项目/章节归属、sceneKey 和 `updatedAt`；任务 source digest 不得从用户 prompt 推导。
