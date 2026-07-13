---
doc_id: AIR-D2-A3-2A-IMAGES-DONE-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: 章节图像完成状态实施
---

# Findings

- DB preflight mapper 当前不带 legacy `sourceStoryboardUpdatedAt`，DB completion 以不可变 `sourceStoryboardId` + ready 文档判断来源一致，避免错误复用旧时间字段。
- Chapter milestone trigger 只允许单调前进；更新使用 rowVersion CAS，重放在已 `images_done` 时无副作用。
