---
doc_id: AIR-G3-M3-A12-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A12 代码探索与 SQLite 集成证据
---

# 发现与取舍

- 旧 `layout.json` 是旧文件事实，不应直接伪装成 G5 `layout_document_v1`；导入器将原文放入 `legacyDocument`，关系证据放入 `sourceBindings`。
- LayoutWorkingCopy 是当前旧布局的可读迁移容器；即使来源完整，本切片也不自动创建不可变 LayoutRevision 或 current 指针，避免越过 G5 codec/来源封存顺序。
- `sourceResolution=complete` 需要同 scope Shot/Candidate/Lock/Asset，且 Asset 有可验证 sha256；缺任一项只降级为 unresolved warning。
- M4 verifier 当前只校验 sealed manifest 追溯锚点，不能把 A12 的单文件 sourceDigest 解释成完整 entityType 复合摘要。
