---
doc_id: AIR-G3-M3-A7-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: G1 角色/素材映射、G2 版本契约、M3-A6 handoff
---

# 目标

导入 `shared/characters.json` 的 Character 正式身份，为 Story V2 与后续 Storyboard 角色引用提供稳定 target ID。

# 非目标

- 不导入 Asset、CharacterVisual、SceneVisual、Candidate、Lock、Preflight 或真实图片字节。
- 旧 preview/primary/reference asset ID 不猜测为可用视觉；视觉关系留给 Asset/Visual slice。

# 实施阶段

- [x] 解析角色 JSON，稳定生成 Character ID、normalizedName 和 payloadDigest。
- [x] 写入 Character/ImportedEntitySource，支持同库 replay 与 source/payload 冲突。
- [x] Story importer 对旧 `projectCharacterId` 复用同一 Character sourceKey 重键。
- [x] 接入 `db:import --kind shadow --slice characters`，完成集成验证和交接。

# 退出标准

A7 Character 集成通过；角色身份可被 Story/Storyboard 后续引用；没有 Asset/Visual 时不写 current visual 指针；后续 Asset/Visual、Preflight 和生产实体仍保持未完成。
