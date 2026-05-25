# 工作台功能面板前端落地发现记录

---
doc_id: AIR-TASK-WORKBENCH-PANELS-FRONTEND-FINDINGS-001
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户反馈、工作台功能模型、现有 App.vue
---

## 1. 需求理解

用户指出当前“样式是有了”，但产品功能仍像“只是对话”。这意味着下一步不是继续堆视觉效果，而是明确并展示用户能在工作台里推进的业务对象。

## 2. 关键发现

| 发现 | 证据 | 影响 |
| --- | --- | --- |
| 中央区页签仍是输出分类 | `App.vue` 中存在 `overview/story/shots/assets/export` | 与六面板工作台模型不一致。 |
| 左侧输入只触发 `story_parse` mock | `sendChat()` 只调用 `createStoryTask()` | 用户指令没有路由到面板。 |
| 后端当前只支持项目与任务 mock | `ProjectsService.getWorkbenchSnapshot()` 返回空 shots/candidates/assets | 前端应诚实展示 `locked/next`，不能伪装可用。 |
| 右侧只有队列和建议 | 现有 `right-rail` | 需要补充当前对象检查器，让用户知道正在处理什么。 |

## 3. 前端落地判断

本阶段可以完成：

- 六个功能面板的导航和状态展示。
- 项目与故事面板：创建、查看故事、运行结构化任务。
- 剧情结构面板：展示摘要、节拍空态、JSON 预览和结构化动作。
- 分镜、候选图、排版导出、素材包：展示前置条件、空态、锁定原因和后续动作。
- 右侧补充任务、检查器、建议。

本阶段不完成：

- 真实分镜生成。
- 真实图片候选生成。
- 真实排版或导出文件。
- 后端数据模型扩展。

## 4. 风险

| 风险 | 应对 |
| --- | --- |
| 用户误以为未实现面板已经可用 | 使用 `当前/后续/锁定` 状态和锁定原因。 |
| 前端文案过多导致像说明页 | 保持每个面板都有操作区、数据区和状态，而不是长说明。 |
| 后续接真实数据时重写成本高 | 类型和 key 对齐 `WorkbenchPanelKey`，后续可拆组件。 |

## 5. Scrutiny Review

| 检查项 | 结论 |
| --- | --- |
| 是否对齐 `工作台功能模型.md` | 通过。中央区已按六个功能面板组织。 |
| 是否废弃旧输出页签 | 通过。`App.vue` 已使用 `WorkbenchPanelKey`，文档契约已更新。 |
| 是否误放非 MVP 功能 | 通过。页面检查未出现搜索、通知、团队协作、升级计划、版本历史等文本。 |
| 是否改变后端协议 | 未改变。 |
| 静态验证 | `typecheck` 和 `build` 通过。 |

## 6. Runtime/User Review

| 检查项 | 结论 |
| --- | --- |
| 桌面页面是否渲染 | 通过，截图见 `evidence/workbench-panels-desktop.png`。 |
| 移动页面是否渲染 | 通过，截图见 `evidence/workbench-panels-mobile.png`。 |
| 面板数量 | 通过，Playwright 检测 `.panel-tabs button` 数量为 6。 |
| 正式功能名是否可见 | 通过，项目与故事、剧情结构、分镜工作台、候选图工作台、排版导出、素材包均可在页面文本中检出。 |
| 指令和面板是否分工明确 | 初步通过，左侧为命令区，中央为功能区，右侧为任务/检查/建议。 |

## 7. 后续建议

- 下一阶段优先拆出 `WorkbenchSurface` 和六个 panel 组件，避免 `App.vue` 继续膨胀。
- 后端下一步应补故事更新接口和结构化结果字段，否则“项目与故事”和“剧情结构”只能停留在半功能状态。
- 分镜工作台接入前，应先扩展 `WorkbenchSnapshot.storyStructure` 和 `Shot` 创建协议。
