# 章节正文草稿缓冲 + AI 批量逐章生成 · task_plan

---
doc_id: AIR-TASK-2026-06-21-CHAPTER-DRAFT-BUFFER
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-21 讨论（AI 工具写入能力 + 章节正文缺草稿缓冲 + 批量逐章生成需求）
---

## 1. 任务类型

结构改造 + 功能开发类。给章节正文（sourceText）引入草稿缓冲层（仿分镜的 pending 机制），并支持 AI 连续逐章生成。分三期执行。

## 2. 背景

### 2.1 问题起源
用户要让 AI "一次性生成完整剧本、一章一章写入"。但调查发现：

- AI 没有写入剧本大纲/章节/批量建章的"真工具"（ADR-0005 决策：生成内容类走伪工具调用，不做成真工具）。
- 章节正文（sourceText）**没有草稿缓冲**：AI 通过 `writeChapterDraftFromAI` 写入即直接覆盖正式 `script.md` 落盘（`projects.service.ts:1243-1259`），用户无法"先检查再确认生效"。
- 对比：剧情结构、分镜阶段都有 pending 机制（写预览 → 用户确认才转正式），但章节正文没有。
- AI prompt 硬性禁止一次生成多章（`dialogue.service.ts:2322`），且单章生成路径不支持连续多章。

### 2.2 用户认知偏差（已对齐）
用户原以为"有确认草稿按钮让用户先检查再确认生效"。代码事实：这个机制对剧情结构/分镜成立，对**章节正文不成立**（AI 写入即生效，没有 pending 层）。本任务的核心就是补上这层缺失。

### 2.3 为什么不做"真工具"
ADR-0005 拒绝把生成内容做成真工具的理由（长文本当参数会超限/写两遍）在本场景**不成立**——因为正文从来不当工具参数传，后端直接从 AI response.content 拿正文（`dialogue.service.ts:2289-2305`）。所以本任务走"伪工具调用 + pending 缓冲"路线，不改 ADR-0005 的真工具边界。

## 3. 目标

1. 给章节正文引入草稿缓冲层（`script.pending.md`，仿 `storyboard.pending.json`）。
2. AI 生成章节正文时写入 pending 缓冲，不直接覆盖正式 sourceText。
3. 用户能逐章或批量确认 pending → 转正式 sourceText；能丢弃 pending；能重新生成。
4. AI 能连续逐章生成多章 pending（批量生成整本），碰到已有正式 sourceText 的章节停下来。
5. AI 能先拆章（建空章节骨架）再逐章填正文。

## 4. 非目标

- **不改 ADR-0005 的真工具边界**：写入仍走伪工具调用（dialogue.service 识别意图 → 调 projects.service），不把章节写入做成 OpenCode 真工具。
- **不做多草稿版本**：一个章节同时只有一份 pending，新生成覆盖旧的。
- **不做 pending 的 diff 对比 UI**：二期只做"预览 pending 全文 + 采纳/丢弃"，不做逐字 diff。
- **不改 completeChapter 的核心语义**：完成本章仍推进到 script_done。"确认草稿"是独立动作，不和"完成本章"绑定。
- **不做跨章节的项目级 pending 列表**：pending 挂在每个 chapter 上（仿 pendingStoryboard），snapshot 切章时各自读取。

## 5. 关键决策（已定）

| 决策点 | 结论 | 依据 |
| --- | --- | --- |
| 写入路径 | AI 逐章写入，正文不当工具参数 | 后端从 response.content 直接拿正文 |
| 草稿缓冲存储 | 独立 `script.pending.md` 文件（仿分镜） | 与 storyboard.pending.json 平行，清晰 |
| 草稿份数 | 单草稿，新生成覆盖 | 简单，和分镜一致 |
| 章节骨架来源 | 三期：AI 先拆章建空章节，再逐章填正文 | 骨架和连续生成内聚 |
| 覆盖已有正式内容 | 严格：正式 sourceText 非空就停 | 保护用户已有内容 |
| 确认方式 | 批量"全部确认" + 逐章"确认"都要 | 灵活 |
| 生成打断 | 不打断，用户可随时叫停 | 体验流畅 |
| pending 挂载位置 | 每个 chapter 独立挂 pendingSourceText | snapshot 不用大改 |
| 范围划分 | 三期：后端骨架 → 前端草稿区 → AI 批量生成 | 每期独立可验证，风险最低 |
| 拆章位置 | 放三期 | 一期专注缓冲机制 |

## 6. 三期阶段划分

### 第一期：后端草稿缓冲骨架（地基）

**目标**：章节正文能存/取/确认草稿；AI 单章生成改走 pending（不碰正式 sourceText）。

| 阶段 | 内容 | 角色 |
| --- | --- | --- |
| 1.1 | DTO 加 pendingSourceText 字段（ChapterDetail + WorkbenchSnapshot） | Worker |
| 1.2 | LocalChapter 加 pendingSourceText 字段 + 9 处初始化（createDefaultChapter/completeChapter/clearChapterScript/importScriptToChapters/createNextChapter ×3/snapshot） | Worker |
| 1.3 | script.pending.md 落盘/读盘（writeChapterFiles + readChapterFromWorkspace，照抄 storyboard.pending.json） | Worker |
| 1.4 | 新增 savePendingChapterSource（写缓冲）+ confirmPendingChapterSource（确认转正式）+ discardPendingChapterSource（丢弃）方法 + controller 路由 | Worker |
| 1.5 | 改 writeChapterDraftFromAI：写入目标从 sourceText 改为 pendingSourceText（AI 生成走缓冲，不碰正式） | Worker |
| 1.6 | Scrutiny：typecheck + build + 单章生成走 pending 的 API 验证 | Scrutiny |

**一期退出标准**：
- typecheck + build 通过。
- AI 单章生成 → 落盘 script.pending.md（不覆盖正式 script.md）。
- 调 confirmPendingChapterSource → pending 转正式 script.md，pending 清空。
- 调 discardPendingChapterSource → pending 删除，正式不变。
- 正式 sourceText 非空时，AI 生成报错或写入前校验（为三期"碰非空就停"打基础）。

### 第二期：前端草稿区 UI

**目标**：用户能在前端看 pending、逐章确认、批量确认、丢弃、重新生成。

| 阶段 | 内容 | 角色 |
| --- | --- | --- |
| 2.1 | ScriptDocumentEditor 加 pending 预览横幅（照抄 StoryboardWorkspace 的 pending 横幅结构） | Worker |
| 2.2 | 加"采用草稿"/"丢弃草稿"/"重新生成"按钮 + emit 事件 | Worker |
| 2.3 | workbench-store 加 applyPendingSourceUpdate / discardPendingSource action | Worker |
| 2.4 | 加"全部确认"批量入口（章节列表层，一次性转所有 pending） | Worker |
| 2.5 | Scrutiny：typecheck + build + 页面交互验证 | Scrutiny |

**二期退出标准**：
- 前端能看到 pending 草稿预览。
- 点"采用草稿"→ 正式更新，pending 消失。
- 点"丢弃草稿"→ pending 删除，正式不变。
- 点"全部确认"→ 所有章节 pending 批量转正式。
- typecheck + build 通过。

### 第三期：AI 批量生成 + 拆章

**目标**：AI 能连续生成多章 pending，能先拆章建空骨架再填正文，碰非空停。

| 阶段 | 内容 | 角色 |
| --- | --- | --- |
| 3.1 | 新增 createEmptyChaptersFromOutline：AI 拆大纲 → 建 N 个空章节（复用 parseProvidedScriptChapters 拿标题，sourceText 填空，增量建章不清盘） | Worker |
| 3.2 | 新增 createGenerateMultipleChaptersToolResult：遍历目标章节列表，每章调 generateScriptFromOutlineWithAI + 写 pendingSourceText（不写正式） | Worker |
| 3.3 | 每章生成前检查正式 sourceText 非空 → 停下，返回"已停在第 N 章（已有内容）" | Worker |
| 3.4 | prompt 调整：支持"批量生成"意图识别 + 循环生成时的章节衔接上下文 | Worker |
| 3.5 | Scrutiny：typecheck + build + 批量生成端到端验证 | Scrutiny |

**三期退出标准**：
- 用户说"按大纲生成整本"→ AI 拆章建空骨架 → 逐章填正文到 pending（不碰正式）。
- 碰到已有正式 sourceText 的章节，停下并提示。
- 生成的多章 pending 都能在一期/二期的机制里被确认/丢弃。
- typecheck + build 通过。

## 7. 复用清单（降低风险的关键）

本任务大量复用已验证的 pending 机制，不是发明新东西：

| 要做的 | 照抄哪 | 位置 |
| --- | --- | --- |
| pending 字段挂载 | pendingStoryboard | LocalChapter:134 |
| pending 落盘 | storyboard.pending.json 写盘 | projects.service.ts:3390 |
| pending 读盘 | readPendingChapterStoryboard | projects.service.ts:2367 |
| save pending | savePendingChapterStoryboard | projects.service.ts:1673 |
| confirm pending | confirmChapterStoryboard | projects.service.ts:1706 |
| 前端 pending 横幅 | StoryboardWorkspace 的 pending 横幅 | StoryboardWorkspace.vue |
| store apply | applyPendingStoryboardUpdate | workbench-store.ts:584 |
| 拆章 | parseProvidedScriptChapters | projects.service.ts:2481 |
| 增量建章 | importScriptToChapters 的 existing 复用段 | projects.service.ts:1166-1192 |

## 8. 风险

| 风险 | 应对 |
| --- | --- |
| LocalChapter 9 处初始化漏加 pendingSourceText | Scrutiny 阶段 grep 全部 createDefaultChapter/createNextChapter 调用点核对 |
| 三期 AI 批量生成质量下降（多章连续写） | 三期单独放最后；prompt 加章节衔接上下文；单章 prompt 不变只是外层循环 |
| "碰非空就停"判断不准 | 一期 1.5 就加正式 sourceText 非空校验，三期复用 |
| pending 概念扩展到多章导致 snapshot 复杂 | 每章独立挂 pending，snapshot 不改结构，切章各自读 |
| 二期前端工作量大 | 抄 StoryboardWorkspace 的 pending 横幅，降低工作量 |
| completeChapter 与 confirmPending 的关系 | 确认草稿独立成动作，不绑 completeChapter，避免语义混淆 |

## 9. 执行节奏

- 本 task_plan 是**三期全景规划**，一次性写清三期。
- **执行时一期一期来**，每期完成后 Scrutiny + 用户确认，再进下一期。
- 每期完成后在 progress.md 记录，每期有自己的退出标准。
- 三期全部完成后写功能完成记录 + ADR-0008。

## 10. 文档同步（三期完成后）

- `文档/04_方案与决策/` 新增 ADR-0008 章节正文草稿缓冲机制。
- `文档/02_架构与契约/核心数据模型.md` Shot/Chapter 节补 pendingSourceText 语义。
- `文档/02_架构与契约/生成任务协议.md` 补"章节正文生成走 pending 缓冲"。
- `文档/00_索引/AI上下文入口.md` 补一条产品取舍。
- 三期各自的完成记录或合并完成记录。
