---
doc_id: AIR-G3M2-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: G3-M2 静态复核
---

# Scrutiny Review

结论：M2 codec 范围通过；允许把 normalized decisions 交给 M3 importer，不允许把 M2 误报成 shadow/final。

- mapper 没有 import 旧 runtime reader，且不 trim/lowercase/fallback；four_panel、missing、invalid 都 fail-closed。
- issue detail/resolution 字段闭合，safe preview 不序列化任意旧对象；detail/resolution unknown fields 会拒绝。
- decisionsDigest 由 shared canonical JSON 对排除自身字段的完整 artifact 计算；entries 必须按 issueKey 升序且不可重复。
- sourceManifestDigest、sourceDigest、issueKey 和 sourceKey 都参与 stale 检查；reportDigest 排除时间/run identity。
- CLI 只读取 sealed snapshot 的 source digest 并写显式 output，不触碰 Prisma、目标 DB 或活动 workspace。
- 残留风险：完整 issue 集合与 MigrationRun terminal immutability 需在 M3/数据库集成中验证；M2 只是 codec，不是 importer。

