# 检查剧本链路与文件落盘发现

---
doc_id: AIR-TASK-SCRIPT-FILE-AUDIT-FINDINGS-001
status: in_progress
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 任务探索发现
---

## 需求理解

用户希望核对当前剧本 AI 链路，以及创建项目后项目目录里的文件是否真实保存了 AI 生成的大纲、章节剧本内容和固定格式。

## 研究发现

- 文档约定：项目级剧本大纲应保存到 `workspace/projects/{projectId}/script-outline.md`，元数据保存到 `script-outline.json`。
- 文档约定：章节剧本应保存到 `workspace/projects/{projectId}/chapters/chapter-001/script.md` 等章节目录。
- 文档约定：章节正文应为固定「章节剧本」格式，且不把剧本名称写进章节正文。
- 当前代码链路中，`generate_inspiration_seeds` 只生成 3 个灵感种子，不写项目文件；选中灵感后 `generate_script_outline_from_seed` 生成并保存项目级大纲；用户确认大纲后 `generate_script_from_outline` 生成当前章节并写入章节文件。
- `ProjectsService.saveScriptOutlineFromAI` 写入项目级 `script-outline.md/json`；`ProjectsService.writeProjectFiles` 会在项目存在 `scriptOutline` 时持久化这两个文件。
- `ProjectsService.writeChapterFiles` 会写入 `chapters/{chapterSlug}/chapter.json`、`script.md` 和最近一次 `script.revisions/latest.json`。
- 实测项目 `b224e22c-9cdf-4195-851c-6bae207789c8` 的大纲文件存在，`script-outline.json.status` 为 `confirmed`。
- 实测项目第 1 章 `script.md` 存在且包含固定「章节剧本」六段格式；`chapter.json.title` 与正文标题一致，为 `第 1 章：别相信他`。
- 实测项目第 2 章目录存在但 `script.md` 为空，符合当前“只生成当前一章”的产品约束。
- `project.json.status` 当前文件里仍写 `draft`，但 API 项目列表根据章节正文推导返回 `story_ready`；这是文件元数据与运行时视图的不一致。

## 证据路径

- `文档/04_方案与决策/2026-05-27_剧本对话功能再设计方案.md`
- `文档/02_架构与契约/核心数据模型.md`
- `apps/server/src/dialogue/dialogue.service.ts`
- `apps/server/src/projects/projects.service.ts`
- `packages/shared/src/script-format.ts`
- `workspace/projects/b224e22c-9cdf-4195-851c-6bae207789c8/script-outline.md`
- `workspace/projects/b224e22c-9cdf-4195-851c-6bae207789c8/chapters/chapter-001/script.md`

## 缺口和风险

- 灵感种子本身不是稳定项目文件，只存在 pending 状态/对话工具结果中；服务重启或对话丢失后，已保存的大纲和章节仍在，但那组灵感候选无法作为独立项目事实恢复。
- 对话历史仍是进程内 Map，服务重启后会丢失；已落盘的大纲和章节不受影响。
- `project.json.status` 与 API 推导状态不一致，后续如果有外部工具直接读 `project.json`，可能误判项目仍是 `draft`。
