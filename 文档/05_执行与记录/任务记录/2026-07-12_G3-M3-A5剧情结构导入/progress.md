---
doc_id: AIR-G3-M3-A5-PROG-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A5 执行记录
---

# 进度

## 2026-07-12

- 新增 `StoryShadowImporter`，接入 `db:import --slice story`。
- `structure.json` 规范化为 StoryDocumentV2；Scene/Beat 投影使用稳定实体 ID，并写入 ImportedEntitySource。
- 先挂 Chapter pending 指针，再写投影，最后由 trigger formalize 为 confirmed；source 不可证明时只写 blocker，不插入伪 confirmed 版本。
- A5 集成测试覆盖成功链路、current 指针、replay 幂等和 unresolved source；typecheck 已通过。

# 当前状态

A5 代码与定向验证已完成，待全量门禁、文档复核和提交；Storyboard/Shot 是下一切片。
