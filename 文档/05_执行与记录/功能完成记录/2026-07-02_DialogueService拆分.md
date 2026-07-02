# DialogueService 巨石拆分(对话工具链)

---
doc_id: AIR-DONE-2026-07-02-DIALOGUE-SPLIT
status: active
created: 2026-07-02
updated: 2026-07-02
owner: AI漫游项目
source: 任务 2026-07-02_DialogueService拆分
---

## 1. 功能摘要

把全仓最大源文件 `apps/server/src/dialogue/dialogue.service.ts` 从 **3014 行** 拆到 **515 行**(−83%),套用已验证的 ProjectsService 门面委托模式(ADR-0005)。按对话工作流拆出 3 个独立 service + 6 个 util 文件,核心会话生命周期保留在 DialogueService。

行为与调用面零变更:`DialogueController` 仍只依赖 `DialogueService`;子 service 通过 `setEnsureSession` 回调注入 OpenCode session 解析器,避免重复持有线程状态。

## 2. 影响范围

- 后端 dialogue 模块:从 1 service 拆为 4 service + 6 util + 1 types
- 调用面零变更:`DialogueController` / `ProjectsService` / 前端不变
- 模块内 DI:dialogue.module.ts providers 注册 4 个 service

## 3. 修改文件

| 文件 | 变化 |
| --- | --- |
| `dialogue.service.ts` | 3014 → 515 行;保留会话核心(threads/stream/turn 生命周期)+ 编排器(tryHandleScriptTools 委托)+ createFailedToolResult;注入 3 个子 service |
| `script-dialogue.service.ts`(新) | 1023 行;剧本工具链(import/inspiration/outline/chapter);持有 3 个 pending Map |
| `story-structure-dialogue.service.ts`(新) | 270 行;剧情结构工具链;持有 pendingStoryStructures Map |
| `storyboard-dialogue.service.ts`(新) | 231 行;分镜工具链;无 pending Map(走 projectsService 持久层) |
| `dialogue-types.ts`(新) | 76 行;6 个内部 interface(LocalDialogueThread/DialogueTurn/Pending*) |
| `dialogue-intent.util.ts`(新) | 338 行;意图分类器(shouldGenerate*/isConfirming*/resolveSelected*/parseChineseOrder 等) |
| `dialogue-prompt.util.ts`(新) | 562 行;8 个 prompt 构造器 + 4 个边界契约 + STEP_LABELS + buildPrompt |
| `dialogue-json.util.ts`(新) | 278 行;JSON normalize/parse(storyboard/story-structure/inspiration) |
| `dialogue-text.util.ts`(新) | 160 行;record/文本辅助 + ensureChapterMarkdown/ensureScriptOutlineMarkdown |
| `dialogue-key.util.ts`(新) | 22 行;pending Map key 派生 |
| `dialogue.module.ts` | providers 注册 4 个 service |

## 4. 拆分策略(6 轮)

| 轮次 | 内容 | Service 行数 |
| --- | --- | --- |
| 1 | 抽类型 + 纯函数 util 基建(零风险) | 3014 → 2969(仅类型 import) |
| 2 | 抽 ScriptDialogueService(剧本工具链) | 2969 → 1562 |
| 3 | 抽 StoryStructureDialogueService(剧情结构) | 1562 → 1143 |
| 4 | 抽 StoryboardDialogueService(分镜) | 1143 → 676 |
| 5 | 清理重复 prompt/边界/意图方法 | 676 → 515 |

## 5. 关键设计决策

### 5.1 session 解析器回调注入

子 service 的 AI 调用器需要 OpenCode session,但 session 由 DialogueService 的 `ensureOpenCodeSession`(依赖 threads Map)管理。为避免子 service 重复持有线程状态,采用回调注入:

```typescript
// 子 service
private ensureSession!: (thread, snapshot, signal?) => Promise<string>;
setEnsureSession(fn) { this.ensureSession = fn; }

// DialogueService constructor
this.scriptDialogue.setEnsureSession((thread, snapshot, signal) => this.ensureOpenCodeSession(thread, snapshot, signal));
```

### 5.2 pending Map 归属

- `pendingScriptImports`/`pendingInspirationSeeds`/`pendingScriptOutlines` → ScriptDialogueService(剧本流程独占)
- `pendingStoryStructures` → StoryStructureDialogueService(剧情结构流程独占)
- 分镜无 pending Map(走 projectsService.getPendingChapterStoryboard 持久层)
- 项目删除清理:`DialogueService.deleteProjectRuntimeState` 编排,调用各子 service 的 `clearForProject(id)` + `tryDeleteThreadState(threadId)`

### 5.3 调用面不变

DialogueController 只依赖 DialogueService。子 service 是 DialogueService 的内部实现细节,不对外暴露。ADR-0005 门面委托模式在 dialogue 模块内复用。

## 6. 数据或协议变化

无。对话线程、pending 缓冲、AI 调用、tool result 结构全部保持原样。纯文件级重构。

## 7. 验证命令与结果

| 验证项 | 结果 |
| --- | --- |
| `pnpm typecheck`(shared/server/web) | ✅ 三包全部 Done |
| `pnpm test`(shared/server) | ✅ 61 passed(shared 15 + server 46) |
| 运行时 | ⏳ 待人工验证(灵感/大纲/章节/结构/分镜对话链路) |

## 8. 已知风险

- 运行时对话链路尚未人工验证(本次为静态验证:typecheck + 单测)。建议下次启动 dev 跑一遍:灵感生成→大纲确认→章节生成→剧情结构生成确认→分镜生成确认。
- `dialogue-prompt.util.ts`(562行)是最大 util 文件,主要是长字符串 prompt 模板,可接受。

## 9. 后续建议

- 补 dialogue util 单测(意图分类器、JSON normalize),提升回归保护。
- dialogue.service.ts 515 行已是健康状态,无需继续拆。
- 运行时验证后,若发现回归,优先检查 `setEnsureSession` 回调是否在所有子 service 都正确注入(3 处 constructor 调用)。
