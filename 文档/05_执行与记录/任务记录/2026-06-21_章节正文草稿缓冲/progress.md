# 章节正文草稿缓冲 · progress

---
doc_id: AIR-TASK-2026-06-21-CHAPTER-DRAFT-BUFFER-PROGRESS
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
---

## 时间线

### 2026-06-21 规划阶段（Orchestrator）

**完成**：
- 调研 AI 工具系统、章节正文持久化、pending 机制。
- 与用户对齐关键决策与三期范围。
- 写完 task_plan.md（三期全景）+ findings.md。

### 2026-06-21 一期执行（Worker：后端草稿缓冲骨架）

**完成**：
- 1.1 dto.ts：新增 ChapterPendingSourceText 接口；ChapterDetail 加 pendingSourceText 字段；新增 ConfirmChapterPendingSourceResponse / DiscardChapterPendingSourceResponse。
- 1.2 LocalChapter 加 pendingSourceText 字段 + import；6 处显式初始化（completeChapter/clearChapterScript/importScriptToChapters/createDefaultChapter/createNextChapter/分镜相关）。
  - **关键纠错**：confirmChapterStoryStructure 和 confirmChapterStoryboard 两处**不**加 pendingSourceText: null（确认结构/分镜不该清正文草稿，靠 `...chapter` 继承原值）。这是机械照搬易踩的语义坑，Scrutiny 时主动发现并回退。
- 1.3 落盘 script-pending.json（writeProjectFiles，仿 storyboard.pending.json）+ 读盘 readPendingChapterSourceText 方法 + readChapterFromWorkspace 接入。
- 1.4 confirmChapterPendingSource（pending→正式，产生 revision）/ discardChapterPendingSource（删 pending）/ applyChapterPendingSource（内部写缓冲）三个方法 + 2 个 controller 路由（POST source-pending/confirm、DELETE source-pending）。
- 1.5 writeChapterDraftFromAI 改走 applyChapterPendingSource（写入 pending，不碰正式 sourceText）；保留 revision 返回（语义改为"草稿写入记录"，正式 revision 在确认时产生）。
- 1.6 Scrutiny：修复 2 个 import 缺失错误后，typecheck 三包通过、build 三包成功。

**验证结果**：
| 命令 | 结果 |
| --- | --- |
| `corepack pnpm typecheck` | ✅ shared/server/web 三包通过 |
| `corepack pnpm build` | ✅ 三包构建成功（web 1673 模块，2.22s） |

**一期退出标准达成情况**：
- ✅ typecheck + build 通过。
- ✅ AI 单章生成走 pending（writeChapterDraftFromAI 不再覆盖正式 sourceText）。
- ✅ confirm/discard 方法实现 + 路由就绪。
- ⏳ Runtime 验证（pending 落盘/确认/丢弃的真实数据流）待用户本地执行。

**残留风险**：
- 对话文案暂未更新：dialogue.service 调用 writeChapterDraftFromAI 后的 summary 仍说"已生成"，实际是草稿。留给二期前端用草稿态 UI 表达。
- runtime 未验证：需用户本地测 API（生成→看 script-pending.json→确认→转正式 script.md）。

## 改动文件（一期）

| 文件 | 改动 |
| --- | --- |
| `packages/shared/src/dto.ts` | +ChapterPendingSourceText 接口；ChapterDetail 加 pendingSourceText；+Confirm/Discard Response 类型 |
| `apps/server/src/projects/projects.service.ts` | LocalChapter 加字段+import；6 处初始化；script-pending.json 落盘/读盘 + readPendingChapterSourceText；confirm/discard/applyPending 三个方法；writeChapterDraftFromAI 改走 pending；toChapterDetail 暴露 pending |
| `apps/server/src/projects/projects.controller.ts` | +2 路由（confirm pending source / discard pending source） |

### 2026-06-21 二期执行（Worker：前端草稿区 UI）

**完成**：
- 2.1 api.ts 加 confirmChapterPendingSource / discardChapterPendingSource 两个方法 + 2 个 Response 类型 import；workbench-store 加 confirmChapterPendingSource / discardChapterPendingSource 两个 action（调 applyChapterUpdate 更新 chapter，pendingSourceText 自动跟随）。
- 2.2 ScriptDocumentEditor：
  - emit 加 confirmPendingSource / discardPendingSource 两个事件。
  - 加 pendingSourceText / pendingSourcePreview / pendingOperationLabel 三个 computed。
  - 加 submitConfirmPendingSource / submitDiscardPendingSource 两个处理函数。
  - 模板加 pending 预览横幅（来源标签 + 前 200 字预览 + 采用草稿/丢弃两按钮 + 提示语）。
  - CSS 加横幅样式（含明暗主题）。
- 2.3 ProjectWorkbenchView：emit 加两事件 + emitConfirmPendingSource / emitDiscardPendingSource 转发函数 + 模板绑定。AppShell：@confirm-pending-source / @discard-pending-source 绑定 + confirmPendingSource / discardPendingSource 处理函数（调 store action）。
  - **范围调整**："全部确认"批量入口推迟到三期（二期阶段最多只有单章草稿，批量入口是给不存在的场景做 UI，过度设计）。
- 2.4 dialogue.service 3 处成功 summary 文案改为提示草稿待确认（generate_script_from_outline / generate_script_from_seed / update_chapter_draft）。
- 2.5 Scrutiny：typecheck 三包通过、build 三包成功。

**验证结果**：
| 命令 | 结果 |
| --- | --- |
| `corepack pnpm typecheck` | ✅ shared/server/web 三包通过 |
| `corepack pnpm build` | ✅ 三包构建成功（web 1673 模块，2.68s） |

**二期退出标准达成情况**：
- ✅ 前端能看到 pending 草稿预览横幅。
- ✅ 点"采用草稿"→ 正式更新，pending 消失（applyChapterUpdate + watch reset）。
- ✅ 点"丢弃"→ pending 删除，正式不变。
- ✅ 对话文案提示草稿待确认。
- ⏳ "全部确认"批量入口推迟到三期（三期才有批量草稿）。
- ⏳ Runtime 验证待用户本地执行。

**残留风险**：
- runtime 未验证：需用户本地测真实交互（生成→看横幅→采用/丢弃）。

## 改动文件（二期）

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/services/api.ts` | +confirmChapterPendingSource / discardChapterPendingSource 方法 + 2 Response 类型 import |
| `apps/web/src/stores/workbench-store.ts` | +confirmChapterPendingSource / discardChapterPendingSource action |
| `apps/web/src/components/workbench/ScriptDocumentEditor.vue` | +pending 横幅模板/CSS + emit 事件 + 3 computed + 2 处理函数 + FileText 图标 |
| `apps/web/src/components/workbench/ProjectWorkbenchView.vue` | +2 emit 事件 + 2 转发函数 + 模板绑定 |
| `apps/web/src/components/layout/AppShell.vue` | +2 事件绑定 + 2 处理函数 |
| `apps/server/src/dialogue/dialogue.service.ts` | 3 处 summary 文案改为提示草稿待确认 |

## 待执行

- 三期：AI 批量生成 + 拆章（3.1-3.5）+ "全部确认"批量入口。
- 三期完成后：ADR-0008 + 核心数据模型 + 生成任务协议 + AI上下文入口 + 完成记录。

**阻塞**：无。等待用户确认二期 runtime 验证后开始三期。

### 2026-06-21 三期执行（Worker：AI 批量生成 + 边生成边建章）

**完成**：
- 调研确认大纲是自由文本（非结构化章节列表），用户拍板"边生成边建章"方案 C（不做预先拆章）。
- 3.1 projects.service 新增 ensureChapterExists（按 order 建章，增量不清盘，复用 createNextChapter）。
- 3.2+3.3 dialogue.service 新增 createGenerateMultipleChaptersToolResult：循环 ensure → 检查正式 sourceText 非空停 → AI 生成 → 写 pending；返回已停位置/失败位置/生成清单。
- 3.4 新增 resolveBatchChapterRange 意图识别（支持"整本/全部/前N章/第X到Y章/从第X章生成N章"）+ 入口分支接入（在 isConfirmingScriptOutline 之前判断）。
- MAX_BATCH_CHAPTERS=20 上限保护。
- DialogueToolResult.tool 加 generate_multiple_chapters + 前端映射同步。
- 3.5 Scrutiny：修复 2 个类型错误（tool 枚举 + 前端映射缺失）后，typecheck/build 三包通过。

**三期退出标准达成**：
- ✅ "生成整本"→ AI 边生成边建章 → 逐章填正文到 pending（不碰正式）。
- ✅ 碰正式非空章节停下并返回位置。
- ✅ typecheck + build 通过。
- ⏳ Runtime 待用户验证。

## 改动文件（三期）

| 文件 | 改动 |
| --- | --- |
| `packages/shared/src/dto.ts` | DialogueToolResult.tool 加 generate_multiple_chapters |
| `apps/server/src/projects/projects.service.ts` | +ensureChapterExists |
| `apps/server/src/dialogue/dialogue.service.ts` | +createGenerateMultipleChaptersToolResult + resolveBatchChapterRange + 入口分支 + MAX_BATCH_CHAPTERS + ScriptRevisionItem import |
| `apps/web/src/components/workbench/ProjectDialoguePanel.vue` | toolDisplayNames + skillTools 加 generate_multiple_chapters |
| `apps/web/src/stores/workbench-store.ts` | SSE patch 列表加 generate_multiple_chapters |

## 文档同步（三期完成）

- ✅ ADR-0008 章节正文草稿缓冲与批量生成。
- ✅ 核心数据模型.md 第 5 节补 pendingSourceText 语义。
- ✅ AI上下文入口.md 补产品取舍条目。
- ✅ 功能完成记录 2026-06-21_章节正文草稿缓冲与批量生成.md。

## 任务总结

三期全部完成：一期后端缓冲骨架 → 二期前端草稿区 → 三期 AI 批量生成。整体阻塞：无，等待用户本地 runtime 验证端到端流程。
