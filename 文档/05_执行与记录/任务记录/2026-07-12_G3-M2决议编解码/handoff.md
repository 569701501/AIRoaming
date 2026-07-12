---
doc_id: AIR-G3M2-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-M2 实现与验收
---

# Handoff

## 已完成

- `mapLegacyComicFormat` 独立于旧 file runtime reader，固定 canonical/auto_mapped/decision_required 三种结果。
- 具体 issue code：`COMIC_FORMAT_FOUR_PANEL_REQUIRES_CONTAINER`、`COMIC_FORMAT_MISSING`、`COMIC_FORMAT_INVALID_LEGACY_VALUE`。
- `buildComicFormatIssue` 生成稳定 issueKey、safe preview、detailJson；`resolveComicFormatIssue` 和 resolution parser 校验 four_panel intent。
- `createMigrationDecisionArtifact` / `normalizeMigrationDecisionArtifact` 使用 shared `digestCanonicalJson`，严格校验 schema、字段、顺序、重复和 source digest。
- `createComicFormatReport` 输出脱敏项目摘要和稳定 reportDigest。
- `migration:decisions:check --snapshot --input --output --format json` 只校验 sealed snapshot source digest 并输出 normalized artifact，不写数据库。

## 未完成且禁止越界

- M2 不创建/更新 MigrationRun、MigrationIssue 表，也不执行 audit/shadow/final。
- M3 importer、M4 verifier/shadow、M5 backup、M6 activate/SecretStore 仍未开始。
- `page_horizontal` 不产生 decision entry；四格决议仍必须由后续 importer/用户流程消费。

## 验证

见 `evidence/commands.md`；M2 基线为 `131fbc2`。

