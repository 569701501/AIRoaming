---
doc_id: AIR-G3-M3-A2-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: M3-A2 实现与 SQLite 集成证据
---

# Handoff

## 已完成

- `ProjectChapterShadowImporter` 只读取已封口并完成 digest 校验的 snapshot，解析 `project.json`、`chapter.json` 和 `script.md`。
- 在 Project 写入前消费并校验 decisions；canonical/auto-mapped 可直接导入，`decision_required` 缺少决议时只阻断对应项目，匹配决议后记录 resolved issue。
- Project、Chapter 和 `ImportedEntitySource` 使用稳定 target ID、sourceDigest、payloadDigest 和 `partial` provenance；同一批 Project 子树在一个 Prisma transaction 中写入。
- `db:import --kind shadow` 已提供；`--kind final` 固定返回 `MIGRATION_FINAL_IMPORT_NOT_READY`，避免 A2 结果被误当成切换入口。
- fresh SQLite 集成测试证明同库 replay 不新增实体，章节约束失败会回滚整个 Project 子树。

## 明确未完成

- A2 只覆盖 Project/Chapter shadow；ScriptVersion/Outline、Story、Storyboard/Shot、Preflight、Task、Asset/Visual、Candidate/Lock、Layout/Export、Dialogue 和 provider metadata 尚未导入。
- 尚未实现完整 `db:verify`、两轮 shadow 等价校验、backup、activate 或 production cutover。
- Chapter 的 script 当前只保存为 working copy，不能声称历史 ScriptVersion 已完成迁移。

## 下一步

实现 G3-M3-A3 Script/Outline importer：先定义 ScriptVersion/Outline 的来源键、payloadDigest、版本/当前指针映射和缺失历史的 `legacy_stub` 规则，再接入同一套 run/issue/source 账本和 Project 子树事务边界。
