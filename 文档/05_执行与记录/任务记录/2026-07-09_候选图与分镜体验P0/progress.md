# 进度记录：候选图与分镜体验 P0

---
created: 2026-07-09
status: planning
---

## 2026-07-09 Orchestrator 规划阶段

### 已采取操作
- 调用 $deep-think 进入深思熟虑流程，担任 Orchestrator 角色
- 读取必读事实源：AI上下文入口.md、写作规范与留痕规则.md
- 探索候选图后端：image-candidate.service.ts（生成/锁定/完成链路）
- 派 Explore agent 深挖候选图前端链路（store/api/组件/任务创建/prompt可见性）
- 派 Explore agent 深挖分镜工作台现状（缩略预览/重排/重写/重编号四项缺失边界）
- 产出 task_plan.md（目标/非目标/6项任务/约束/退出标准）
- 产出详细 HTML 方案（候选图与分镜体验P0-方案.html）供用户审阅
- 写 todo（10项，2阶段）

### 关键探索发现（影响方案）
- 候选生成后端已是 push（追加），5态数据模型已定义，差的只是前端 UI
- prompt 拼装在 store 私有函数 buildCandidatePositivePrompt，从不暴露
- 分镜缩略预览数据全通（lockedCandidateId→candidate→assetId→url），纯前端接线
- 分镜重排无需新 API，复用整体 PATCH，删除重排范式已有
- 批量生成复用串行队列（runTaskSerialized 已就绪）
- 分镜改动会让候选图失效（storyboard.service.ts L238-241），重排需提示

### 验证
- 规划阶段无需 typecheck/test，待 Worker 阶段执行

### 下一步
- 等待用户审阅 HTML 方案
- 审阅通过后，Worker 进入阶段1任务A（候选单格重画）

## 2026-07-09 Worker 执行阶段

用户确认方案后，转 Worker 角色执行 6 项任务。

### 阶段1（候选图体验）

**任务A 候选批次语义**：完成
- ImageCandidatesWorkspace.vue：selectedCandidates 改 candidateBatches（按 taskId 分组），最新批次展开/旧批折叠
- "再生成一组"文案改"重新生成（保留旧批）"，批次标签"第N次生成"
- 改动文件：apps/web/src/components/workbench/ImageCandidatesWorkspace.vue

**任务B 候选5态UI**：完成（前端视觉层）
- 候选卡按状态着色：locked绿/selected蓝/rejected灰/superseded淡灰
- 新增 .candidate-status 标签 + .digest-tag prompt摘要角标
- 批次折叠/展开交互（toggleBatch + collapsedBatchIds）
- 改动文件：ImageCandidatesWorkspace.vue
- 后端持久化API（PATCH /candidates/:id/status）后置，当前5态由lockCandidate驱动

**任务C prompt可见**：完成
- 新建 apps/web/src/utils/candidate-prompt.ts：buildCandidatePositivePrompt/getCandidateImageSize/getPreflightReferenceAssetIds/buildPromptPreviewSections 提为纯函数
- workbench-store.ts 改 import 纯函数（删除本地实现）
- ImageCandidatesWorkspace.vue 新增 prompt 预览折叠区（结构化分段 + 完整prompt）
- 改动文件：utils/candidate-prompt.ts（新）、workbench-store.ts、ImageCandidatesWorkspace.vue

**阶段1验证**：typecheck 通过

### 阶段2（分镜体验）

**任务D 分镜缩略预览**：完成
- StoryboardWorkspace.vue 新增 getShotThumb(shotId)：shot.lockedCandidateId → candidates → assetId → projectAssetFileUrl
- 镜头卡头部加缩略图区：已锁🔒+图/未锁最新一张+数量/空态
- 改动文件：StoryboardWorkspace.vue

**任务E 拖拽重排+批量重编号**：完成
- 用原生 HTML5 拖拽实现（vuedraggable 因 pnpm store 版本问题装不上，改零依赖方案）
- 新增 reorderShots/renumberShots/onDragStart/onDragOver/onDrop/onDragEnd
- 拖拽手柄 ⋮⋮ + dragIndex/dragOverIndex 视觉反馈
- 已有候选时拖拽弹失效确认提示
- 工具栏加"重新编号"按钮
- 改动文件：StoryboardWorkspace.vue

**任务F 批量生成**：完成
- workbench-store.ts 新增 generateAllUnlockedShots action：循环 createTask（每镜1张，已锁跳过）
- ImageCandidatesWorkspace.vue 加"批量生成(N)"按钮 + unlockedShotCount
- 接线：ProjectWorkbenchView.vue + AppShell.vue
- 改动文件：workbench-store.ts、ImageCandidatesWorkspace.vue、ProjectWorkbenchView.vue、AppShell.vue

**阶段2验证**：typecheck 三包通过 + server 48 test 全绿

### Scrutiny Review 结论
- 通过。6项任务前端全部落地，数据流与方案一致。
- 无新后端 API、无新依赖（原生拖拽）。
- 残留：候选"废弃/备选"主动操作的持久化API后置（当前5态由lock驱动已够用）。

### Handoff（用户运行复核）
请在真实环境验证：
1. 候选图：多次重画候选按"第N次"批次分组；展开prompt预览看完整提示词
2. 分镜：镜头卡显示已锁缩略图；拖拽手柄调整顺序（有候选时弹确认）；点"重新编号"
3. 候选图：点"批量生成"一键生成全章未锁镜头
