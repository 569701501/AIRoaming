---
doc_id: AIR-G2-E2-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E2 代码探索与静态复核
---

# 探索发现

- `PreflightDocumentCodecV2` 已把 source snapshot、character/scene/style checks、issues 和 ready 约束冻结；E2 直接调用 codec，禁止手写宽松 JSON。
- G1 Schema 已有 Character/CharacterVisual/Asset、ChapterScene/SceneVisual/Asset 和 PreflightRevision；E2 不新增表或字段。
- 0009 `trg_g2_preflight_revisions_v2_current_insert` 只允许 confirmed+ready 且 Script/Story/Storyboard 链 current、无 pending 的 V2 revision；repository confirm 必须在 trigger 之前完成 source/CAS 检查。
- SourceSnapshot 中的 visual/asset 三元组必须全空或全满；资产 sha256 不符合 digest 格式时按“无可用参考图”处理，不伪造 ready。

## E2 结论

- preview 与 confirm 都在同一 scoped source builder 上重建，客户端只提交 expected source ID/digest/Chapter rowVersion，不提交 freshness 或任意 preflight document。
- confirm 成功只插入不可变 revision、更新 Chapter current pointer；旧 revision 保留，Storyboard 新 current 会由 Shared resolver 派生旧 Preflight stale。
- E2 目前覆盖 DB 可见的角色/场景视觉事实；active reference task、worker claim 和迟到结果适用性不是本切片能力。
