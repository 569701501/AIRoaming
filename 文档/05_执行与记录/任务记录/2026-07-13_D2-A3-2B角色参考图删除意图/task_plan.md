---
doc_id: AIR-D2-A3-2B-DELETE-PLAN-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa, ai-agent
source: D2 至 M6 总 Handoff P5 与 G1 asset.delete 契约
---

# Character reference delete intent

## 目标

在 DB 模式把角色参考图删除收口为可重放的 `asset.delete` intent：事务内解除 current/preview 指针、撤销 CharacterVisual、标记 Asset deleting，并保留物理文件等待 Outbox consumer。

## 非目标

- 本阶段不实现 Outbox claim/lease/consumer。
- 不删除 Character、CharacterVisual 历史行、Candidate/Lock/Layout/Export 历史。
- 不访问真实 workspace、真实数据库或真实 provider。

## 退出标准

- 当前视觉可删除且 intent 唯一；重复请求不新增 event。
- in_use 主视觉、未 ready 素材、历史引用素材均拒绝。
- 物理文件在 intent 阶段保持不变。
- 定向集成、server 全量、typecheck、Scrutiny、临时根 Runtime 全部通过。
- capability 保持 partial，等 P8 Outbox consumer 后再更新 aggregate evidence。
