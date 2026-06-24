# ChapterScriptService 抽取(第七轮)

---
doc_id: AIR-TASK-CHAPSCRIPT-SVC-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
source: 任务 2026-06-24_ChapterScriptService抽取
---

## 1. 范围

章节剧本编排(641行编排 + 辅助):saveChapterDraft/completeChapter/clearChapterScript/
confirmPending/discardPending/importScriptToChapters/analyzeScriptImport/
writeChapterDraftFromAI/applyChapterPendingSource/saveScriptOutlineFromAI/
confirmScriptOutline/resetProjectScript/createChapterScriptVersion/
createNextChapter/ensureChapterExists/getChapter + 辅助。

依赖:projectStore/repository/workspacePathService。无循环依赖。
门面委托模式(同 CharacterReferenceService,ADR-0005)。

## 2. 留 Service 的辅助(toChapter*/sortChapters/parseScriptRevision)

toChapterListItem/toChapterDetail/toChapterScriptVersionItem/sortChapters/parseScriptRevision
被结构/分镜/出图准备等也用,留 Service(或抽 ProjectStore)。

## 3. 退出标准

- ChapterScriptService 抽出。
- Service 行数下降(2212 → ~1600)。
- typecheck + test 全绿。
- 调用面不变。
