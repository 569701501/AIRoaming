---
doc_id: AIR-D2-A5-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: P7 code exploration and tests
---

# 发现与决策

1. Prisma runtime 表已经存在于 0005/0008；本阶段不需要新增 migration。
2. `ConversationMessage` 的 G1 trigger 只允许 assistant `running → completed/failed`，因此采用“先占位、后终态”的写法，不能回写 terminal message。
3. `DialogueRuntimeSession` 的合法终态是 `closed/archived`，restart 收口使用 `closed`，不伪造 schema 未允许的 `interrupted`。
4. project-level thread 的 pending payload 可以保留 payload 内的 chapterId，但 `PendingDialogueArtifact.chapterId` 必须与 thread scope 一致；否则 G1 scope FK 会拒绝写入。
5. Story/Storyboard 的现代 DB pending 仍由 G2 version repositories 持有；旧 Dialogue facade 不得把旧 workspace 文件当事实源。D2-A6 不得借此绕过 Outbox。
