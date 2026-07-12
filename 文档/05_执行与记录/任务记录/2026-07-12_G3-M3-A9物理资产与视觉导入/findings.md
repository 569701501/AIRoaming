---
doc_id: AIR-G3-M3-A9-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: A9 代码探索与 SQLite 集成证据
---

# 发现与取舍

- A8 只建立 staged Asset；A9 才能在物理文件已落盘且摘要完整时 promote ready，避免把 snapshot 元数据当成文件存在。
- 目标文件必须写在显式 workspaceRoot 下，storageKey 经过相对路径 guard；已有文件若摘要不同直接冲突，不覆盖。
- 图片尺寸复用现有 PNG/WebP/JPEG 头解析器；图片无法读取尺寸时 fail-closed。
- CharacterVisual/SceneVisual 的 current 指针在同一 DB transaction 内、且在 ready Asset 和 available visual 已存在后写入，满足 G1 scope trigger。
- A9 用独立 `AssetPhysicalEvidence` sourceKey 记录物理证据，不改写 A8 的 Asset 元数据来源账本；重放不会把两个来源误判为冲突。
