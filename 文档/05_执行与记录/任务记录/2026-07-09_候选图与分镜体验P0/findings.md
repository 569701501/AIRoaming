# 探索发现：候选图与分镜体验 P0

---
created: 2026-07-09
status: planning
---

## 需求理解

P0 目标：让候选图和分镜这两步用户体验达到市面主流水准。来自竞品对照终版结论：
- 候选图：单格重画语义不清、5态UI没用起来、prompt完全黑盒
- 分镜：无缩略预览、无拖拽重排、15镜要逐个生成

## 研究发现

### 候选图现状（后端已就绪，前端缺 UI）
- 后端 image-candidate.service.ts：生成是 push（追加 L181），不覆盖旧候选
- 5 态枚举已定义：generated/selected/locked/rejected/superseded（dto.ts L1065）
- candidate.taskId 已落盘（dto.ts L1089）—— 天然批次标识，无需新字段
- 候选结果更新依赖 runtime 整快照轮询（refreshActiveProjectRuntime L388）
- prompt 拼在 store 私有函数 buildCandidatePositivePrompt（L81-99），从不暴露
- 候选只存 promptDigest（sha1 摘要），不存原文

### 候选"再生成一组"现状
- 前端 emit payload 与"生成候选"完全相同（只有 shotId+candidateCount）
- 不区分首次/重画，不清理旧候选，后端无条件 push
- 重复生成无限累积，UI 平铺无分组

### 分镜现状
- StoryboardWorkspace.vue 完全不读 snapshot.candidates，无缩略图
- 镜头列表普通 v-for，无拖拽；删除时已有 map(order=index+1) 重排范式（L350）
- order 字段存在但弱（可能有空洞），后端按 order 排序但不重排值
- 无单镜头重写链路（grep 全 0 命中）—— P1
- 无批量重编号、无 reorder API（但整体 PATCH 可复用）

### 分镜与候选联动
- 数据全通：shot.lockedCandidateId → candidates → assetId → projectAssetFileUrl
- ImageCandidatesWorkspace.vue L158-165 有现成缩略图范式可复用

## 证据路径

- 候选 push：apps/server/src/projects/image-candidate.service.ts:181
- 5态定义：packages/shared/src/dto.ts:1065
- prompt 黑盒：apps/web/src/stores/workbench-store.ts:81-99
- 分镜无候选引用：apps/web/src/components/workbench/StoryboardWorkspace.vue（grep candidate 0命中）
- 分镜改动致失效：apps/server/src/projects/storyboard.service.ts:238-241
- 删除重排范式：apps/web/src/components/workbench/StoryboardWorkspace.vue:350

## 风险

1. 分镜重排致候选失效（storyboard.service.ts L238-241 回退 images_done）
   - 对策：拖拽前确认提示；已锁候选按 shot.id 保留关联
2. 候选状态持久化：废弃/备选是否跨刷新保留
   - 对策：P0 补 PATCH /candidates/:id/status 持久化（数据一致性优先）
3. vuedraggable 与 Vue3 嵌套表单兼容性
   - 对策：用 next 版本，先小范围验证

## 技术决策

- 6 项任务全部不需要新后端 API（候选生成/分镜PATCH/批量队列已就绪）
- 唯一可能新增：PATCH /candidates/:id/status（废弃/备选持久化，单接口改动小）
- 唯一新依赖：vuedraggable（拖拽）
- prompt 提为纯函数放 utils/，store 和组件共用
