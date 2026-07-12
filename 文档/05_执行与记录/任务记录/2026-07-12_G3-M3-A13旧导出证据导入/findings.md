---
doc_id: AIR-G3-M3-A13-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A13 代码探索与 SQLite 集成证据
---

# 发现与取舍

- 旧导出文件不能直接满足 G5 `layout_publication` 的 ready 条件；本切片只恢复历史事实，统一使用 `legacy_unresolved`，避免伪造可消费发布物。
- manifest 的文件 sha256 是 sealed source anchor，`ExportRevision.manifestDigest` 使用 manifest JSON 的规范化 digest；两者分别保存在 ImportedEntitySource 与业务记录中。
- 导出目录按章节/导出目录分组，sourceKey 含 scope、group 和 revision；先查已有来源再分配 revision，保证重放不产生新历史。
- 即使 manifest 存在，也不自动建立 ExportArtifact 或 current 指针；Artifact 生成必须等待 G5 codec、渲染和发布验收。
