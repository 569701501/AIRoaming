---
doc_id: AIR-TASK-20260716-AI-CHAPTER-EXPLICIT-GENERATE-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 事实发现

- Shared 已有严格 `creative.ideation / creative.outline / creative.chapter-draft` 解析器，但生产 `dialogue-prompt.util.ts` 仍输出旧三区块大纲，`ensureScriptOutlineMarkdown()` / `ensureChapterMarkdown()` 仍会把非法输出包装成旧格式。
- 灵感解析当前对超过 3 个候选执行 `slice(0, 3)`，没有落实“恰好 3 个”契约。
- `ScriptDialogueService` 当前章节生成调用旧 `createAiPendingSuggestion`，新 pending 仍会成为 `kind=legacy`，不会绑定大纲、章节卡和前章正式版。
- `ScriptWorkflowSourceRepository.createAiChapterPending()` 已能密封大纲/章节卡/前章正式版，但尚无“生成前读取精确上下文 + 写入时校验仍是同一来源集”的读接口，且未写对话/revision 追溯。
- `isConfirmingScriptOutline()` 把单独“继续”和章节生成表达混在同一判定中；已确认大纲存在时，非明确生成语句可能误触 A4。
- 现有 `createGenerateMultipleChaptersToolResult()` 仍可被对话批量生成表达触发，与 AI 路线按章显式生成的 V1 主路冲突。
- 完成本章当前总是按 `createNextChapter=true` 创建下一章，没有校验已确认大纲是否真有下一张章节卡。
- Web 待确认区只显示约 200 字预览，完成后仍展示“继续下一章”按钮；这两点与用户已确认的 A5 不一致。

# 风险与结论

- A4 必须先读取密封来源集再调用模型，写 pending 时用预期 `sourceSetDigest` 做并发复核；否则可能把基于旧前章生成的文本绑到新前章版本。
- 大纲确认与 A4 生成必须分开判定：裸“继续”或只确认大纲最多推进大纲为 confirmed，不调用模型；页面“确认并生成当前章”因为携带明确 intent，仍可一次完成两个连续动作。
- 页面不增加内容字段；只把同一份 pending 在现有正文区完整只读展示，并删除已被用户否定的“继续下一章”动作。

# 实现结论

- A2 已改为严格 `creative.ideation/1.0`，模型必须恰好返回 3 个候选，不再截断或宽松提取。
- A3 已改为严格四区块项目大纲，章数必须为正整数，章节卡数量与章数一致且连续；每卡只保存目标、冲突、转折、钩子和衔接。
- A4 只接受明确当前章生成表达或 `generate_script_from_outline` intent；批量生成请求返回解释性失败，章节切换和裸“继续”不会创建 pending。
- A4 在调用模型前读取确认大纲、目标/相邻章节卡和上一章完整正式正文；写入时用同一 `sourceSetDigest` 做 CAS 复核，成功后密封 `kind=ai` pending、来源绑定与对话 revision。
- A5 在现有正文区域显示完整只读 pending；采用后才进入 Working Copy，完成后才形成正式版本。完成页只保留“进入本章剧情结构”。
- 下一章入口只从确认大纲的下一张章节卡建立，标题也以章节卡为准；最终章不创建多余章节，页面不自动切换。
- 浏览器复核发现并修复了章节作用域对话工件的持久化错误：pending artifact 现在按真实 owner thread 的 chapter scope 保存，并可跨项目级/章节级线程正确结束旧 pending。

# 验证结论

- Shared：26 个文件、152 项测试通过。
- Server：全量 99 个文件、583 项中 582 项通过；唯一失败为无关 `RST-02` 在全量串行负载下超过固定 5 秒，单独重跑 3.65 秒通过。
- 针对性 Server：A2/A3/A4 意图与 Prompt 11 项通过；P7 章节作用域对话持久化通过；来源仓储 2 项通过。
- 浏览器：DB-only A3～A5 真实路径 1/1 通过，覆盖大纲确认不偷跑、显式生成、全文查看、采用、完成、下一章入口和切章不生成。
- 全工作区 typecheck、E2E typecheck、Shared/Server/Web build、Prisma validate、G1 manifest/schema/migration check、`git diff --check` 均通过。
- 三个更新后的创作 Skill 均通过 `skill-creator` quick validation。
