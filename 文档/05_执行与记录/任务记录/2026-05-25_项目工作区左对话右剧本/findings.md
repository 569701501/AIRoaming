# 发现与决策：项目工作区左对话右剧本

---
doc_id: AIR-TASK-20260525-WORKBENCH-DIALOGUE-SCRIPT-FINDINGS
status: active
created: 2026-05-25
updated: 2026-05-25
owner: AI漫游项目
audience: ai-agent, developer
source: 代码核对、当前 UI 信息架构、用户明确要求
---

## 1. 需求

- 创建项目成功后，直接进入项目工作区。
- 项目工作区默认打开第 1 步“剧本”。
- 首屏布局必须是左侧“对话框”，右侧“剧本文档编辑器”。
- 对话框不是弹窗，是项目内公共左侧面板。
- AI 输出不能自动覆盖右侧剧本文档，必须由用户点击“应用”或“插入”。

## 2. 研究发现

| 路径 | 结论 |
| --- | --- |
| `apps/web/src/stores/workbench-store.ts` | `createProject` 会设置 `activeProjectId`，随后 `refresh` 拉取 `snapshot`，因此创建后会进入项目工作区 |
| `apps/web/src/components/workbench/ProjectWorkbenchView.vue` | 当前仍是工作区 header + 6 步流程 + `ProjectStoryPanel`，不是左对话右剧本布局 |
| `apps/web/src/components/layout/AppShell.vue` | 当前始终渲染 `AppSidebar`，项目工作区尚未隐藏全局左侧导航 |
| `apps/web/src/components/workbench/ProjectStoryPanel.vue` | 当前承担剧本字段表单和故事原文编辑，但不是右侧“剧本文档编辑器”目标态 |
| `文档/01_愿景与产品/当前UI信息架构.md` | 已明确创建/打开项目后进入工作区，首屏应为左对话框 + 右剧本文档编辑器 |
| `文档/01_愿景与产品/功能清单与页面链路.md` | 已明确当前代码还未对齐目标布局，下一版必须实现 |

## 3. 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 文档写了目标态，但代码仍是旧面板 | 后续 AI 或开发者可能误判已经完成 | 在任务计划中标记 `ui_shell`，实现前不得宣称完成 |
| 直接把对话框做成真实 AI | 运行时复杂度盖过页面链路问题 | 第一版先做 UI 壳和动作入口，OpenCode 后接 |
| 保留全局侧边栏 | 违背用户“进入项目后左侧是对话框”的要求 | `AppShell` 按 `snapshot` 切换布局，项目态隐藏 `AppSidebar` |
| 旧 `ProjectStoryPanel` 继续膨胀 | 单文件/单组件过大，不符合组件拆分要求 | 拆成左侧 `ProjectDialoguePanel` 和右侧 `ScriptDocumentEditor` |

## 4. 技术决策

| 决策 | 依据 |
| --- | --- |
| 先实现布局，后接 OpenCode | 当前用户质疑的是页面链路与布局，不是 AI runtime |
| 组件按功能拆分 | 用户明确要求不能全部写在一个文件里 |
| 对话框首版可以是可交互 UI 壳 | 文档中真实 AI 接入已另有 OpenCode 移植方案，不能混在本任务里 |
| 保存草稿继续复用现有 `PATCH /projects/{projectId}` | 后端已有草稿保存和 workspace 写入能力 |

## 5. 当前判断

当前文档已经被修正为：

```text
创建项目成功
  -> 项目工作区
  -> 第 1 步“剧本”
  -> 左侧对话框
  -> 右侧剧本文档编辑器
```

当前代码已经完成首屏目标布局：

- `AppShell` 在项目工作区隐藏全局左侧导航和顶部栏。
- `ProjectWorkbenchView` 使用左侧 `ProjectDialoguePanel`、右侧 `ScriptDocumentEditor`。
- `ScriptDocumentEditor` 继续复用现有项目草稿保存契约。
- `ProjectDialoguePanel` 当前是 UI 壳，不代表真实 OpenCode 对话、上传、应用或插入能力已经完成。
