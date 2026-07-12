---
doc_id: AIR-G3-M3-A12-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: A12 实现与 SQLite 集成证据
---

# Handoff

## 已完成

- `LayoutShadowImporter` 从 sealed snapshot 读取旧 `layout/layout.json`，生成稳定 `LayoutWorkingCopy` 和 ImportedEntitySource。
- legacy envelope 明确 `schemaVersion/kind/sourceResolution/legacyDocument/sourceBindings`；来源完整时保存 lock-set digest，来源不足不推进 current。
- CLI 已接入 `--slice layout`；A12 集成测试覆盖 complete/replay，typecheck 已通过。
- server 全量 45 个测试文件、256 项测试，G1 三项门禁与 diff check 均通过。

## 明确未完成

- ExportRevision/ExportArtifact、旧导出目录/manifest、Dialogue/provider metadata 和 full importer orchestration 未实现。
- M4 双 fresh shadow、API DTO/Asset hash 等价和 entityType 复合来源摘要仍未完成；M4 保持 `in_progress`。

## 下一步

继续补旧导出证据导入（只读 legacy_unresolved/有 manifest 的 ExportRevision 分支），同时保持 final、backup、activate fail-closed。
