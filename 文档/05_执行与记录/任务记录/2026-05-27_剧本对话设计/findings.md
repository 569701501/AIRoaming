# 剧本对话设计发现

---
doc_id: AIR-TASK-SCRIPT-DIALOGUE-DESIGN-FINDINGS-001
status: in_progress
created: 2026-05-27
updated: 2026-05-27
owner: AI漫游项目
audience: human, ai-agent, developer
source: 剧本对话设计任务
---

## 需求理解

用户认为当前剧本对话功能需要重新设计。本轮先回答“现在是什么样的”，再形成设计建议。

## 事实发现

### 文档事实

- 剧本页已经进入章节工作流，当前章节来自 `WorkbenchSnapshot.currentChapter`，本地目标路径为 `workspace/projects/{projectId}/chapters/{chapterSlug}/script.md`。
- 对话框是项目内左侧常驻 AI 面板，不是弹窗；组件公共，但聊天内容不能自动成为项目事实。
- 已确认原则是：AI 输出不能直接覆盖右侧文档，必须由用户显式应用、插入、保存、锁定或确认后才进入事实源。

### 当前代码事实

- 前端 `ProjectDialoguePanel.vue` 已支持消息列表、快捷建议、输入框、发送按钮、流式 assistant 回复和失败状态。
- 前端附件按钮仍是灰态，停止生成未实现。
- 前端 store 和 API 支持读取模型列表、发送消息时透传 `model`，但当前对话面板模板没有渲染可见模型选择控件，文档中“模型下拉已实现”的说法需要修正。
- 后端 `DialogueService` 使用进程内 `Map` 保存线程，线程 key 当前是 `projectId + stepKey`，不是章节级。
- 后端 prompt 已读取 `WorkbenchSnapshot.currentChapter` 的章节标题和已保存正文，旧 `snapshot.story` 只作兜底。
- `ProjectWorkflow` 已接入，可作为对话框 placeholder、快捷建议、阶段上下文、后端 prompt 和按钮状态的主输入。
- 当前 `SendDialogueMessageRequest` 只有 `content`、`stepKey`、`model`，没有 `chapterId`、`intent`、未保存草稿 `sourceText` 或选中文本。
- 当前 assistant 回复是纯文本 `DialogueMessageItem.content`，没有 `DialogueSuggestion`、`applyState`、`proposedPatch` 或应用记录。
- 右侧 CodeMirror 编辑器内部具备插入/包裹文本能力，但对外只暴露保存、完成本章和更新正文事件，没有暴露给对话消息使用的插入/追加动作。

### 当前用户体验

- 用户可以在右侧编辑并保存当前章节剧本，也可以在左侧向 AI 提问并看到流式回复。
- AI 当前主要看见已保存的当前章节正文；用户右侧未保存的新草稿不会进入本轮 prompt。
- 用户若想采用 AI 回复，只能手动复制粘贴到编辑器。
- 第 1 章和第 2 章当前会共享同一个剧本步骤线程，后续容易混淆章节上下文。

## 风险

- 章节工作流已经确立后，继续用 `projectId + stepKey` 做剧本对话线程会污染不同章节的上下文。
- 未保存编辑器草稿不进入 AI prompt，会让用户感觉 AI 没看到最新内容。
- 如果第一版直接做复杂 diff patch，会放大实现成本和误覆盖风险。
- 对话历史当前只在进程内，服务重启后丢失；这不阻塞 M1，但需要在 UI 或文档中认识到风险。

## 结论

- 剧本对话当前是“聊天辅助 + OpenCode 流式输出 + 已保存当前章节上下文”，还不是完整写作闭环。
- 下一步应先做 M1：`projectId + stepKey + chapterId` 作用域、请求携带当前未保存草稿、对话框按 workflow 展示 placeholder 和快捷建议、恢复模型选择控件、assistant 消息提供复制/插入光标/追加末尾动作。
- 应用/插入第一版只改前端编辑器草稿，不直接写 workspace；仍由“保存草稿”写入章节文件。
- 结构化 `DialogueSuggestion`、停止生成、上传、通用 `show_file` 和对话持久化放到后续阶段。
