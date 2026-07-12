---
doc_id: AIR-G3-M3-A4-SCRUTINY-001
status: passed_with_scope_limit
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A4 静态复核
---

# Scrutiny Review

## 通过

1. 只读取 sealed snapshot，source/snapshot/decisions digest 绑定到新 run。
2. pending 不创建 ScriptVersion，不修改 Chapter working copy；revision 只保留 latest。
3. 旧 Dialogue 外键无法验证时全部置空，不能写悬空 ID；source rows 保留原始路径和 digest。
4. replay 不重复插入 pending/revision，也不重复推进 lastScriptRevisionId/rowVersion。

## 范围限制

A4 不证明 Dialogue、Story/Storyboard 或完整 importer 的覆盖，不得标记 G3-M3 completed。
