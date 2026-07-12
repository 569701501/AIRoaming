---
doc_id: AIR-G3-M3-A8-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: A8 代码探索
---

# 发现与取舍

- `Asset` 的 G1 约束要求 ready 资产具备 hash、bytes、readyAt 和图片尺寸；迁移快照只有 `shared/assets.json` 元数据时不能直接写 ready。
- `shared/assets.json` 的旧 `sourceTaskId` 可能没有对应 GenerationTask，因此 A8 不写外键，只在来源 JSON 的 digest 中保留事实。
- `CharacterVisual` 与 `SceneVisual` 的触发器要求关联 ready Asset 和 active project；视觉关系必须等物理文件证据与后续视觉切片。
- 章节引用先映射到 A2 稳定 Chapter ID；引用不存在时 fail-closed，避免产生跨章节悬空 Asset。
- 资产 storageKey 使用 `legacy-import/{targetProjectId}/{legacyAssetId}`，旧路径保存在 payload digest 语义中，避免越界路径和重复路径碰撞。
