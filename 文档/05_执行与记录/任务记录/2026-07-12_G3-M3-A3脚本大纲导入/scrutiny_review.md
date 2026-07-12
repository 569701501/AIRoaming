---
doc_id: AIR-G3-M3-A3-SCRUTINY-001
status: passed_with_scope_limit
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A3 静态复核
---

# Scrutiny Review

## 通过

1. 只读取 sealed snapshot，并绑定 source/snapshot/decisions digest。
2. ScriptVersion 正文非空、digest 为规范化正文 digest，origin 固定为 `import`。
3. current 指针更新与 G2 rowVersion/working-copy 触发器一致；同库 replay 不重复插入、不重复推进 rowVersion。
4. Outline confirmed 状态必须有 confirmedAt，缺失时 fail-closed；历史 current 指针缺失只形成 warning。

## 范围限制

A3 不证明 pending/revision、Story/Storyboard 或完整 importer 的实体覆盖，不得据此标记 G3-M3 completed。
