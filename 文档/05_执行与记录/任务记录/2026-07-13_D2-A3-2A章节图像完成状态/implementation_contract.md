---
doc_id: AIR-D2-A3-2A-IMAGES-DONE-CONTRACT-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: 章节图像完成状态 Handoff
---

# 实施契约

入口 `ProjectsService.completeChapterImages` 在 DB 模式分流至 `ImageCandidateService`。服务读取 DB 投影，校验 `preflightJson.ready`、`sourceStoryboardId`、所有 shot 的 `lockedCandidateId`，再以 `Chapter.rowVersion` 更新 milestone、completedAt、updatedAt；文件模式保持原实现。
