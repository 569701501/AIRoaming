# 剧本大纲确认链路发现

---
doc_id: AIR-TASK-SCRIPT-OUTLINE-CONFIRM-FINDINGS-001
status: active
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 剧本大纲确认链路代码与文档探索
---

## 事实发现

- 旧代码中 `generate_inspiration_seeds` 后，用户选择第 N 个会触发 `generate_script_from_seed` 并直接写当前章节。
- 项目模型此前没有项目级剧本大纲产物，只有章节 `script.md`。
- 右侧编辑器应继续承载章节剧本，不适合混入项目级大纲。
- 用户确认第一版大纲后只生成当前一章，不自动生成多章。

## 设计结论

- 新增项目级 `ProjectScriptOutline`，保存为 `workspace/projects/{projectId}/script-outline.md`。
- 大纲固定包含基础信息、主要角色、情节概要三块。
- 大纲在对话中展示并进入待确认状态；用户确认前可以按要求重新生成。
- `情节概要` 面向后续漫剧按集规划，但当前漫画生产主单位仍是 `Chapter`。

## 风险

- 对话历史仍是进程内状态；服务重启后可从项目文件恢复大纲，但待确认对话状态不会完整恢复。
- 当前只保留当前大纲，未实现大纲历史版本和回退。
