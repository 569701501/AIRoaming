---
doc_id: AIR-G3-M3-A0-FIND-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: 代码库探索
---

# 发现

- Prisma schema 已有 `MigrationRun`、`MigrationIssue`、`ImportedEntitySource`，但当前没有对应的迁移服务。
- G3-M2 已提供 comicFormat mapper、issue codec、decision codec 和 report codec。
- 快照文件的源文件以 `payload/<sourceStorageKey>` 保存，源 digest 位于 `source-manifest.json`；审计必须先验证 `SEALED` 和 manifest，再读取 payload。

# 约束

- 本切片的账本先做纯内存实现，接口和状态规则与 Prisma 模型对齐；后续切片再接数据库 repository。
- 报告 digest 不包含 runId、时间和绝对路径，保证相同快照内容得到相同摘要。
