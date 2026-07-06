# 进度记录：候选图工作台 MVP

## 2026-07-06

- 方案文档转 active，建任务目录三件套。
- P1 完成：
  - 新增 `packages/shared/src/image-candidates.ts`（CandidatesJson 契约 + normalize + 锁定一致性兑底 + pending 计算）。
  - 新增 `packages/shared/src/shot-image-prompt.ts`（DEFAULT_IMAGE_PROMPT_TEMPLATE + buildShotImagePrompt 三段拼装纯函数）。
  - settings 链路新增 `imagePromptTemplate`（shared DTO + settings.service 存储/归一化/运行时读取），null=内置默认。
  - 单测 `image-candidates.spec.ts` 9 条全过（拼接/override/气泡不进 prompt/locked 兑底/pending 计算）。
  - 验证：`pnpm --filter shared test` 24 条全过；shared build + server/web typecheck 全绿。
- P2 开始：ImageTaskQueue 抽取 + candidates 读写 service + image_generate worker + API。

## 2026-07-06（续）P2/P3 完成

- P2 后端：
  - 新增 `ImageTaskQueue`（进程内串行队列），`CharacterReferenceService` 角色参考图/场景参考图 Promise 链改用该共享队列（统一 429 预算）。
  - 新增 `ChapterCandidatesService`（568 行）：读候选文档、prompt override、逐张生成 worker（出图→写盘→注册 asset→追加 candidates.json）、锁定/跳过/重置/废弃、确认→images_done（带分镜漂移校验与 pending 校验）。
  - controller 增 8 个路由（GET candidates / PATCH prompt / POST generate,lock,skip,reset,discard,confirm），module 注册新 provider。
- P3 前端：
  - 新增 `ImageCandidatesWorkspace.vue`：分镜网格、每镜生成/锁定/废弃/跳过/重置、完成确认、分镜漂移提示。
  - workbench-store 增 `candidatesData` state + `loadChapterCandidates`，所有候选 action 落盘 candidatesData；openProject 进入 image_candidates 步骤与轮询均刷新候选文档。
  - AppShell 连接 6 个候选事件 + 传入 candidatesData prop；候选图 URL 走受控 `projectAssetFileUrl`（按 assetId），通过 snapshot.assets 查找 assetId。
- 验证：shared test 24 过；server test 46 过；shared build + server build + server/web typecheck 全绿。
