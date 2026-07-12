---
doc_id: AIR-G3M2-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M2 代码探索
---

# 已确认事实

- `apps/server/src/projects/legacy-project-comic-format.ts` 是 file runtime reader；M2 importer plugin 必须独立实现，不能直接复用该 reader。
- 共享包已提供 `digestCanonicalJson`，应作为 decisionsDigest/reportDigest 的唯一 canonical digest 实现。
- Prisma 已有 MigrationIssue 约束：detail schemaVersion=1，resolved 必须有 resolutionJson/resolvedAt；M2 只提供 codec，不写表。
- G3 旧值 contract 已冻结具体 issue code：`COMIC_FORMAT_FOUR_PANEL_REQUIRES_CONTAINER`、`COMIC_FORMAT_MISSING`、`COMIC_FORMAT_INVALID_LEGACY_VALUE`。

# 风险与取舍

- `page_horizontal` 只做 auto_mapped，不产生人工决议 entry；决议 artifact 只表达 decision_required 项。
- safe preview 只允许安全截断字符串或类型名；对象/数组不做任意 JSON 序列化，避免把旧数据/secret 带入 issue。
- M2 不做 MigrationRun 终态变更，避免在全量 importer 之前制造半成品账本。
