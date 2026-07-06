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
