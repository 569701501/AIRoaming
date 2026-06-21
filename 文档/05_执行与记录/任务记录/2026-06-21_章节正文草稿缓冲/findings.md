# 章节正文草稿缓冲 · findings

---
doc_id: AIR-TASK-2026-06-21-CHAPTER-DRAFT-BUFFER-FINDINGS
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
---

## 1. 关键发现（规划阶段）

### 1.1 章节正文没有草稿缓冲（核心问题）
- `writeChapterDraftFromAI`（projects.service.ts:1215-1267）写入 `chapter.sourceText` 并立即 `writeProjectFiles` 落盘成 `script.md`。
- 没有中间 pending 层，AI 写入即生效，用户无法"先检查再确认"。
- 对比：剧情结构（内存预览）、分镜（storyboard.pending.json）都有 pending，唯独章节正文没有。

### 1.2 用户认知偏差已对齐
- 用户以为"有确认草稿按钮让用户先检查再确认生效"。
- 事实：这对剧情结构/分镜成立，对章节正文不成立（AI 写入即生效）。
- "完成本章"按钮只是推进 status 到 script_done，不是"把草稿转正式"。

### 1.3 ADR-0005 的真工具边界不影响本任务
- ADR-0005 拒绝把生成内容做成真工具的理由（长文本当参数超限/写两遍）在本场景不成立。
- 因为正文从来不当工具参数传——后端从 AI response.content 直接拿正文（dialogue.service.ts:2289-2305）。
- 所以本任务走"伪工具调用 + pending 缓冲"，不动 ADR-0005 边界。

### 1.4 pending 模式成熟可照抄（降低风险的关键）
- 分镜的 pending 全链路都有：落盘（:3390）、读盘（:2367）、save（:1673）、confirm（:1706）、挂载（LocalChapter:134）、snapshot 暴露（:1953）。
- 章节正文草稿缓冲几乎可以 1:1 照抄，不是发明新机制。

### 1.5 多章 pending 的干净解法
- snapshot 现在只暴露 currentChapter.pendingStoryboard。
- 解法：每章独立挂 pendingSourceText，批量生成 = 循环调单章写入，snapshot 不改结构，切章各自读。
- 避开了"项目级 pending 列表"的复杂度。

## 2. 改动范围评估（基于代码事实）

| 改动点 | 难度 | 行数 | 备注 |
| --- | --- | --- | --- |
| DTO 加字段 | 低 | ~5 | 照抄 pendingStoryboard |
| LocalChapter + 9 处初始化 | 低（体力活） | ~15 | 容易漏 |
| script.pending.md 读写 | 低 | ~10 | 照抄 storyboard.pending.json |
| save/confirm/discard 方法 | 低 | ~60 | 照抄分镜 |
| writeChapterDraftFromAI 改走 pending | 低 | ~5 | 一期 1.5 |
| AI 批量生成循环 | 中 | ~80 | 三期，有设计点 |
| prompt 调整 | 低 | ~5 | 去掉禁止多章硬规则 |
| 前端草稿区 UI | 中 | ~100 | 抄 StoryboardWorkspace 横幅 |

## 3. 风险点

### 3.1 LocalChapter 9 处初始化（最大体力活风险）
挂 pendingSourceText 的初始化点：
- createDefaultChapter（:3427）
- completeChapter（:1056）
- clearChapterScript（:1116）
- importScriptToChapters（:1181）
- createNextChapter ×3（:1351/:1398/:4781）
- snapshot 兼容读取（:1953）

Scrutiny 阶段必须 grep 全部调用点核对，不能漏。

### 3.2 三期 AI 批量生成质量
- 让 AI 连续生成多章，质量可能下降。
- 应对：单章 prompt 不变，外层循环；加章节衔接上下文；三期单独放最后便于回归。

### 3.3 "碰非空就停"判断
- 判断依据：chapter.sourceText 非空（不是 pending 非空）。
- 一期 1.5 就加这个校验，三期复用。

## 4. 待确认问题

（执行中累积）

## 5. 证据索引

- writeChapterDraftFromAI 写入即落盘：`apps/server/src/projects/projects.service.ts:1215-1267`
- sourceText 存 script.md：`projects.service.ts:3379`
- pending 全链路：`projects.service.ts:1673/1706/2239/2367/3390`
- AI 从 response.content 拿正文：`dialogue.service.ts:2289-2305`
- prompt 禁止多章：`dialogue.service.ts:2322`
- 拆章 parseProvidedScriptChapters：`projects.service.ts:2481`
- ADR-0005 真工具边界：`文档/04_方案与决策/ADR-0005_真工具调用架构改造.md`
