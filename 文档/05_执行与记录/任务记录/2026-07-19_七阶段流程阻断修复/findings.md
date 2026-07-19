---
doc_id: AIR-TASK-20260719-WORKFLOW-BLOCK-FINDINGS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户截图、运行实例、代码与数据库检查
---

# 已确认事实

## F1：第三步消失的直接原因

- 共享契约 `PROJECT_WORKFLOW_STEP_STATUSES` 包含 `needs_confirmation` 和 `needs_update`。
- `WorkbenchStageRail.vue` 的 `canSelectStage()` 只接受 `done/active`。
- 同组件 CSS 只覆盖 `done/active/waiting/blocked`，未覆盖两个 G2 状态。
- 当前真实项目的 storyboard 步骤正是 `needs_confirmation`，因此按钮禁用且视觉接近消失。

## F2：当前正式/待确认版本状态

- 章节 `milestone_status=structured`。
- `current_story_version_id` 指向 confirmed StoryVersion。
- `pending_storyboard_version_id` 指向 12 镜 pending StoryboardVersion。
- 因此正确下一步是进入分镜工作台检查待确认分镜，而不是重新确认或重新生成剧情结构。

## F3：场景图不回显的直接原因

- 5 个 ChapterScene 均有 currentVisualId，且对应 SceneVisual.assetId。
- DB `loadDatabaseReadModel()` 未加载 ChapterScene/SceneVisual。
- `databaseStoryToLocal()` 原样返回不可变 StoryVersion 的 scenes；页面只从 `scene.referenceAssetId` 查图。
- 正确修复位置是 DTO/read model 的只读投影，不是回写不可变 StoryVersion。

# 风险

- 只修按钮不补 E2E，会在下一次新增 Workflow 状态时再次回归。
- 若直接修改 StoryVersion.documentJson，会破坏版本来源和不可变契约。
- 若只清空页面对话，会丢历史；应区分历史过程记录和当前权威状态。

# 修复结论

- 第 3 步没有业务数据丢失；它是被前端遗漏的 `needs_confirmation` 状态错误禁用并弱化显示。
- `needs_confirmation/needs_update` 都属于需要用户进入处理的状态，不属于等待或阻断状态。
- 场景图事实源仍是 `ChapterScene.currentVisual -> SceneVisual.assetId`；Workbench 只做读取投影。
- 历史对话是审计记录，当前工作区与 Workflow 才是当前状态事实源。
- 真实项目现已进入第 4 步；当前剩余阻塞是 4 个角色需在剧情结构页完成定稿，不是流程栏故障。
