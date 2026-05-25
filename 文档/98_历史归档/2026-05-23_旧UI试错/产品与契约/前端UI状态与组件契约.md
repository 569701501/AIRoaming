# 前端 UI 状态与组件契约

---
doc_id: AIR-ARCH-UI-CONTRACT-001
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 漫画工作室 UI 节点与页面结构、功能范围与UI对齐矩阵、当前 apps/web 实现
---

## 1. 用途

本文档定义 AI漫游前端 UI 节点的状态枚举、组件职责、设计 token、响应式规则和占位能力约束。

当前实现状态：2026-05-23 已按用户要求清空旧工作台页面，`apps/web` 只保留重新设计占位页。本文档中的组件和面板定义作为下一版设计约束，不代表当前页面已经实现。

它用于约束后续实现：

- UI 可以先做壳，但必须标状态。
- 功能按钮不能让用户误以为真实能力已完成。
- 视觉风格必须保持漫画创作工作台一致性。
- 每个主要组件应能追溯到产品节点或模块。
- 当前前端展示必须遵守 `文档/01_愿景与产品/功能范围与UI对齐矩阵.md`。
- 工作台中央区域必须逐步遵守 `文档/02_架构与契约/工作台视图与交互契约.md`，不能长期停留在聊天输出壳。

## 2. UI 能力状态

### 2.1 枚举

```ts
type UiFeatureStatus =
  | "implemented"
  | "ui_shell"
  | "planned"
  | "deferred"
  | "not_in_mvp";
```

| 状态 | 可点击 | 可产生真实业务结果 | 是否可进入主路径 | UI 规则 |
| --- | --- | --- | --- | --- |
| `implemented` | 是 | 是 | 是 | 正常展示 |
| `ui_shell` | 谨慎 | 否或仅 mock | 可以展示但不能冒充完成 | 需要禁用、弱化或清晰标注 |
| `planned` | 否 | 否 | 可作为路线提示 | 默认禁用或指向待实现 |
| `deferred` | 否 | 否 | 不进 MVP 主路径 | 只放次级位置 |
| `not_in_mvp` | 否 | 否 | 否 | 不应占据核心界面 |

### 2.2 JSON 示例

```json
{
  "key": "comic_generation",
  "label": "漫画生成",
  "status": "planned",
  "module": "漫画图候选",
  "mvpStage": "M2",
  "route": null,
  "enabled": false
}
```

## 3. 页面与视图 Key

### 3.1 全局导航

```ts
type StudioNavKey =
  | "workbench"
  | "projects"
  | "story"
  | "storyboard"
  | "candidates"
  | "layout_export"
  | "asset_package";
```

| Key | 中文 | 状态 | 目标路由 | 关联模块 |
| --- | --- | --- | --- | --- |
| `workbench` | 工作台 | `ui_shell` | `/` | 项目管理、工作台 |
| `projects` | 项目 | `implemented` | `/projects` | 项目管理 |
| `story` | 故事 | `implemented` | `/story` | 故事与剧情结构 |
| `storyboard` | 分镜 | `planned` | `/storyboard` | 分镜工作台 |
| `candidates` | 候选图 | `planned` | `/candidates` | 漫画图候选 |
| `layout_export` | 排版导出 | `planned` | `/layout-export` | 漫画排版 |
| `asset_package` | 素材包 | `planned` | `/asset-package` | 素材管理 |

### 3.2 工作台功能面板

```ts
type WorkbenchPanelKey =
  | "project_story"
  | "story_structure"
  | "storyboard"
  | "image_candidates"
  | "layout_export"
  | "asset_package";
```

| Key | 中文 | 状态 | 数据依赖 |
| --- | --- | --- | --- |
| `project_story` | 项目与故事 | `implemented` | `Project`, `WorkbenchSnapshot.story` |
| `story_structure` | 剧情结构 | `ui_shell` | `WorkbenchSnapshot.story`, 后续 `storyStructure` |
| `storyboard` | 分镜工作台 | `ui_shell` | `WorkbenchSnapshot.shots` |
| `image_candidates` | 候选图工作台 | `ui_shell` | `WorkbenchSnapshot.candidates/assets` |
| `layout_export` | 排版导出 | `planned` | 后续 `LayoutPage`、`PanelPlacement` |
| `asset_package` | 素材包 | `planned` | 后续 `Asset[]`、`packageManifest` |

说明：旧的 `overview/story/shots/assets/export` 输出 Tab 已废弃。中央区域必须按 `WorkbenchPanelKey` 渲染功能面板。

### 3.3 编辑器目标 Key

后续独立编辑器应使用以下 Key：

```ts
type EditorSurfaceKey =
  | "dashboard"
  | "script_storyboard"
  | "comic_page_editor"
  | "asset_library"
  | "export_review";
```

## 4. 组件职责

| 组件/区域 | 职责 | 禁止承担 |
| --- | --- | --- |
| `StudioShell` | 全局布局、侧栏、顶部栏、工作台容器 | 不直接处理业务生成逻辑 |
| `StudioSidebar` | 模块导航、品牌 | 不伪装未实现路由，不展示商业化入口 |
| `StudioTopbar` | 当前项目上下文、范围提示 | 不展示未实现的搜索、通知和用户团队入口 |
| `CommandPane` | 项目创建、对话、指令输入、命令路由 | 不展示最终输出全集 |
| `WorkbenchSurface` | 六个功能面板、前置条件、主操作、结果区 | 不承载长对话历史 |
| `RightRail` | 任务队列、对象检查器、AI 下一步建议 | 不展示团队协作和商业化入口 |
| `QueueCard` | 任务状态摘要 | 不替代任务详情页 |
| `HintCard` | AI 建议和下一步 | 建议不能自动修改用户内容，除非用户确认 |

## 5. 数据流契约

当前工作台数据流：

```text
GET /api/projects
  -> CommandPane.projectList

POST /api/projects
  -> WorkbenchStore.activeProjectId
  -> GET /api/projects/:projectId/workbench
  -> WorkbenchSurface.snapshot

POST /api/tasks/mock-story
  -> WorkbenchStore.tasks
  -> RightRail.queue
```

后续真实数据流：

```text
CommandPane.command
  -> command_parse
  -> GenerationTask
  -> TaskEvent
  -> BusinessEntityUpdate
  -> WorkbenchSnapshot refresh
  -> WorkbenchSurface render
```

## 6. 设计 Token

### 6.1 颜色

| Token | 当前值 | 用途 |
| --- | --- | --- |
| `--color-bg-app` | `#f7f9fd` | 应用背景 |
| `--color-surface` | `#ffffff` | 面板和卡片 |
| `--color-border` | `#e2e8f3` | 轻边界 |
| `--color-primary` | `#6d5dfc` | 主按钮、选中态、品牌 |
| `--color-primary-strong` | `#5b4ff4` | 强主色 |
| `--color-text` | `#172033` | 主文本 |
| `--color-muted` | `#5f6b83` | 次级文本 |
| `--color-success` | `#10b981` | 在线、成功 |
| `--color-danger` | `#ef4444` | 通知、错误 |

后续建议将这些值收敛到 CSS 变量，当前 `styles.css` 暂以常量形式存在。

### 6.2 圆角与阴影

| Token | 值 | 规则 |
| --- | --- | --- |
| `--radius-panel` | `8px` | 主面板、卡片、按钮最大圆角 |
| `--radius-control` | `8px` | 输入框、按钮 |
| `--radius-pill` | `999px` | 头像、徽标、状态点 |
| `--shadow-panel` | `0 14px 36px rgba(31, 41, 55, 0.06)` | 主面板阴影 |
| `--shadow-action` | `0 12px 24px rgba(109, 93, 252, 0.24)` | 主按钮阴影 |

规则：

- 页面 section 不做大浮层卡片嵌套。
- 单个重复项可以使用卡片。
- 圆角除头像和徽标外不超过 8px。

### 6.3 字体与字号

| 层级 | 建议 |
| --- | --- |
| 全局字体 | system sans-serif |
| 顶部品牌 | 22px，粗体 |
| 页面标题 | 18px 到 30px |
| 卡片标题 | 14px 到 17px |
| 正文 | 13px 到 15px |
| 辅助文本 | 11px 到 13px |

规则：

- 不使用 viewport width 控制字号。
- `letter-spacing` 默认为 `0`。
- 紧凑面板中的标题不使用 hero 级字号。

### 6.4 图标

| 用途 | 规则 |
| --- | --- |
| 导航 | 使用 lucide 图标 + 中文标签 |
| 主动作 | 使用图标 + 动作文本 |
| 工具按钮 | 优先使用 icon button，必要时加 tooltip/title |
| 状态 | 使用状态图标或色点 |

## 7. 响应式规则

| 断点 | 布局 |
| --- | --- |
| `> 1440px` | 侧栏 + 左命令区 + 中央功能区 + 右侧辅助栏 |
| `<= 1440px` | 侧栏 + 左命令区 + 中央功能区，右侧辅助栏下移 |
| `<= 1080px` | 隐藏全局侧栏，工作台转单列 |
| `<= 720px` | 隐藏顶部次要动作，流程卡单列 |

验收：

- 文本不得溢出按钮或卡片。
- 左命令区和中央功能区不能相互遮挡。
- 右侧辅助栏下移后，核心工作流仍完整。

## 8. 占位节点规则

| 情况 | 规则 |
| --- | --- |
| 按钮未实现 | 使用禁用态，或点击后只触发明确的 mock 任务 |
| 面板仅展示壳 | 标注文档状态为 `ui_shell` |
| 路由未实现 | 导航只改变高亮或禁用，不跳转不存在页面 |
| 队列是假数据 | 必须来自 mock task 或标为暂无任务 |
| 团队协作未实现 | 不作为 MVP 必经路径 |
| 搜索未实现 | 输入框可 readonly 或禁用 |
| 超出矩阵 `later/exclude` | 当前界面不展示 |

## 9. 后续组件拆分建议

当前 `App.vue` 仍是单文件聚合。功能继续增长后，应拆为：

```text
apps/web/src/components/studio/
  StudioShell.vue
  StudioSidebar.vue
  StudioTopbar.vue
  CommandPane.vue
  WorkbenchSurface.vue
  RightRail.vue
  QueueCard.vue
  ProjectCard.vue
  panels/
    ProjectStoryPanel.vue
    StoryStructurePanel.vue
    StoryboardPanel.vue
    ImageCandidatePanel.vue
    LayoutExportPanel.vue
    AssetPackagePanel.vue
```

拆分时要求：

- 组件 props 使用 shared DTO 或本地明确类型。
- 业务请求仍通过 store/service，不在展示组件中散落 API 调用。
- 每拆一个核心组件，补对应模块或组件说明。

## 10. 验收清单

任何前端 UI 变更完成前至少检查：

- [ ] 新节点是否登记到产品 UI 节点文档。
- [ ] 新按钮是否标注能力状态。
- [ ] 未实现能力是否禁用或弱化。
- [ ] 是否通过 `corepack pnpm typecheck`。
- [ ] 是否通过 `corepack pnpm build`。
- [ ] UI 相关变更是否有截图或人工验收说明。
