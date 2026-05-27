# 章节作用域任务强制 chapterId

---
doc_id: AIR-FINISH-TASK-CHAPTER-ID-001
status: active
created: 2026-05-27
updated: 2026-05-27
owner: AI漫游项目
audience: human, ai-agent, developer
source: 章节工作单元方案、生成任务协议
---

## 功能摘要

生成任务中心已对章节作用域任务强制校验 `chapterId`，避免 `story_parse`、`shot_generate`、`image_generate` 等任务只挂到项目级。

## 背景

章节已成为项目内一等工作单元。结构化剧情、分镜、候选图和排版等后续产物必须能追溯到具体章节，因此任务创建阶段需要先拒绝缺少章节上下文的请求。

## 影响范围

- 共享契约新增章节作用域任务类型常量。
- 服务端创建章节作用域任务时强制要求 `target.chapterId`。
- `input.chapterId` 如存在必须与 `target.chapterId` 一致。
- `input.chapterId` 省略时，服务端会按 `target.chapterId` 规范化写入任务输入。
- 前端现有 `story_parse` mock 创建点已经携带当前章节 `chapterId`，保持兼容。
- 前端 API 请求封装兼容 Nest 默认错误响应，避免后端 400 被二次解析错误遮蔽。

## 修改文件

- `packages/shared/src/domain.ts`
- `apps/server/src/tasks/tasks.service.ts`
- `apps/web/src/services/api.ts`
- `文档/00_索引/AI上下文入口.md`
- `文档/02_架构与契约/生成任务协议.md`
- `文档/03_模块梳理/模块总览与依赖.md`
- `文档/05_执行与记录/功能完成记录/README.md`

## 数据或协议变化

当前强制章节作用域的任务类型：

```text
story_parse
shot_generate
shot_prompt_generate
image_generate
layout_export
```

拒绝条件：

| 条件 | 错误码 |
| --- | --- |
| 缺少 `target.chapterId` | `GENERATION_TASK_CHAPTER_ID_REQUIRED` |
| `input.chapterId` 与 `target.chapterId` 不一致 | `GENERATION_TASK_CHAPTER_ID_MISMATCH` |
| `input.chapterId` 非字符串或为空 | `GENERATION_TASK_INPUT_CHAPTER_ID_INVALID` |

## 验证结果

```text
corepack pnpm --filter @airoaming/shared build
corepack pnpm --filter @airoaming/server typecheck
corepack pnpm --filter @airoaming/web typecheck
corepack pnpm typecheck
git diff --check
```

结果：通过。

临时服务验证：

```text
POST /api/tasks story_parse 不带 target.chapterId
POST /api/tasks story_parse target.chapterId 为非字符串
POST /api/tasks story_parse target.chapterId 与 input.chapterId 不一致
POST /api/tasks story_parse 只带 target.chapterId
POST /api/tasks asset_package_export 不带 chapterId
```

结果：缺失、非字符串和不一致都会返回 400；只带 `target.chapterId` 时创建成功且任务输入被规范化为带 `chapterId`；`asset_package_export` 仍可作为项目级任务创建。

## 风险

- 当前只在任务创建入口校验，还未接真实 provider worker 的产物落盘校验。
- `tts_generate` 和 `video_export` 暂未强制单个 `chapterId`，等 P0.5 视频草稿模型接入后再收紧。
- 现有任务仍是进程内 mock，未接数据库约束。

## 后续建议

后续实现真实 `story_parse`、`shot_generate` 和 `image_generate` worker 时，继续在产物写入层校验 `chapterId`，确保 `StoryVersion`、`Shot`、`Candidate` 和 `Asset` 都落到同一章节。
