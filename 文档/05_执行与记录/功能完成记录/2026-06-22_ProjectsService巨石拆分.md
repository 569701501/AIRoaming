# ProjectsService 巨石拆分

---
doc_id: AIR-DONE-2026-06-22-PROJECTS-SERVICE-SPLIT
status: active
created: 2026-06-22
updated: 2026-06-22
owner: AI漫游项目
audience: human, ai-agent, developer
source: 任务 2026-06-21_ProjectsService拆分（架构深化评审候选①+B+C+E）
---

## 1. 功能摘要

`ProjectsService` 从 5236 行单文件巨石拆分为 1 个业务门面 + 9 个独立文件。纯收口重构，行为不变，调用面（Controller / `DialogueService` / `ToolCallbackService`）零变更（不破 ADR-0005）。workspace 持久化（缓存 + 加载链 + 写入链）收口到 `ProjectRepository`；领域纯函数（normalize / 排序 / 工作流状态机 / 出图准备 / prompt 构造）抽成独立 util。

## 2. 影响范围

- 仅后端 `apps/server/src/projects/`，前端无改动。
- 数据结构、任务协议、workspace 文件路径、异步状态：全部不变（契约核查通过）。
- 调用面：Controller / DialogueService / ToolCallbackService 代码无改动。

## 3. 修改文件

| 文件 | 变化 |
| --- | --- |
| `projects.service.ts` | ~5236 → ~3720 行（−1516 行）；删加载链/写入链/normalize/prompt 构造，改委托 Repository/util |
| `projects.module.ts` | 注册 `ProjectRepository` provider |
| 新增 `workspace-json.util.ts` | fs/JSON 读写与解析辅助 |
| 新增 `local-types.ts` | LocalChapter/LocalProject 本地持久化模型 |
| 新增 `project-domain.util.ts` | 排序/枚举 normalize/默认章/label/toChapter |
| 新增 `story-normalize.util.ts` | 剧情结构/分镜 normalize |
| 新增 `character-domain.util.ts` | 角色 normalize + 层级判定 |
| 新增 `workflow.util.ts` | 工作流状态机 |
| 新增 `image-preflight.util.ts` | 出图准备纯逻辑 |
| 新增 `reference-prompt.util.ts` | 参考图 prompt 构造 + asset 解析 |
| 新增 `project-repository.service.ts` | 持久化 Repository（缓存+加载链+写入链） |

## 4. 数据或协议变化

无。纯收口，数据结构与协议不变。`buildImagePreflightJson` / `isChapterImagePreflightReady` 改为接受 `isReferenceTaskRunning` 回调（行为等价，避免 util 依赖 tasksService）。

## 5. 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm -w typecheck` | ✅ shared/web/server 三包通过 |
| Scrutiny 静态复核（路径契约 / 调用面 diff） | ✅ 通过，见任务目录 progress.md |
| Runtime/User Review | ⏳ 待用户本地验证（清单见任务目录 progress.md） |

## 6. 已知风险

- **无单测/e2e**：验证靠 typecheck + 静态复核。runtime 回归需用户按清单执行。
- **回调形态变化**：buildImagePreflightJson/isChapterImagePreflightReady 由直接调 hasActiveCharacterReferenceTask 改为接受回调，行为等价但需 runtime 确认出图准备检查正常。

## 7. 后续建议

- 候选 D（剧本导入分析纯算法）未抽——内聚度高、调用面单一，按需再抽。
- 参考图生成状态编排（queue/run/confirm/delete）留 Service——抽独立 service 会循环依赖，后续若拆需先理清 tasksService 边界。
- 补单测/e2e：本次纯收口无测试保护，建议给 Repository（加载/写入）和关键 util 加测试。
