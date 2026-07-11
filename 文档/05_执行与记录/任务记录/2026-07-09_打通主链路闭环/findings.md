# 打通主链路闭环 · 发现

## 代码事实

- `ImageCandidatesWorkspace.vue` 已可创建 `image_generate`，但依赖 `snapshot.candidates` 与任务状态；候选仍空态。
- `TasksService.create` 默认 `runMockTask`，成功 output 仅为 mock 文案，无 asset/candidate。
- 角色图路径已验证：`createControlled` + worker + `ImageProviderService` + workspace 写文件 + `WorkbenchAsset`。
- `projects.service` 的 `getWorkbenchSnapshot` 目前硬编码 `candidates: []`。
- 仓库写入已预创建 `chapters/*/candidates|layout|exports` 目录，但未写 index 文件。
- workflow 状态机已支持 `images_done → layout_export`、`layout_done/exported → asset_package`。
- server 依赖极简，无 sharp / pdf / zip。

## 契约对齐

- Candidate 模型见 `文档/02_架构与契约/核心数据模型.md` §12。
- 候选图路径：`chapters/{slug}/candidates/{shotId}/{candidateId}.webp`（现行实现）；未来扩展格式时扩展名随 Asset MIME 类型变化，目录层级不变。
- 章节排版：`chapters/{slug}/layout/`；导出：`chapters/{slug}/exports/`。
- 素材包：`exports/packages/{packageId}/` + manifest。
- 任务类型：`image_generate`、`layout_export`、`asset_package_export`。

## 决策记录

见 `task_plan.md` §4。
