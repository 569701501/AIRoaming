# 发现与决策：剧本文档与工作流栏简化

---
doc_id: AIR-TASK-20260526-SCRIPT-DOC-WORKFLOW-FINDINGS
status: active
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: ai-agent, developer
source: 用户反馈、代码核对、当前 UI 信息架构
---

## 1. 需求理解

用户认可“左侧对话框 + 右侧剧本文档”的大方向，但提出两个修正：

- 右侧剧本文档不应再展示项目名称、故事标题、题材标签、漫画格式、画风方向等字段。
- 顶部工作流不应继续用当前的大卡片样式，应参考图中更轻量的工具栏/标签样式。

## 2. 代码现状

| 路径 | 现状 |
| --- | --- |
| `apps/web/src/components/workbench/ScriptDocumentEditor.vue` | 同时编辑项目元信息和剧本正文 |
| `apps/web/src/components/workbench/WorkbenchStageRail.vue` | 6 个流程步骤以大卡片网格展示 |
| `apps/web/src/components/workbench/ProjectWorkbenchView.vue` | 工作区为 header、流程条、左对话右剧本 |

## 3. 风险

| 风险 | 处理 |
| --- | --- |
| 去掉字段后丢失元信息编辑入口 | 当前阶段接受；后续可移入项目设置或由对话提取 |
| API 仍要求 `UpdateProjectDraftRequest` 包含多个字段 | 保存时透传 `snapshot.project` 的现有值，只更新 `sourceText` |
| 参考图有素材、音效、预览、发布等功能 | 本次只借鉴布局密度，不引入未完成功能 |

## 4. 实现结论

- 右侧剧本文档已经简化为只编辑 `StoryVersion.sourceText`。
- 项目名称、故事标题、题材标签、漫画格式和画风方向仍可保留在数据模型中，但不在当前剧本文档页展示。
- 工作流展示已从 6 个大卡片改成紧凑标签栏。
