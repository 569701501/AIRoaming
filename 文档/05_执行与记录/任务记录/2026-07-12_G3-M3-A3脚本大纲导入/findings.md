---
doc_id: AIR-G3-M3-A3-FIND-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: A3 代码与 fresh SQLite 集成测试
---

# 发现

- `script-outline.md` 是正文事实源；`script-outline.json` 只提供 version 1 的状态、标题和时间元数据，正文 digest 由规范化 Markdown 计算。
- `script.versions/script-vNNN.md` 的旧版本 ID 按旧 Chapter ID 和版本号映射；目标 ID 使用 `ChapterScriptVersion + sourceKey` 稳定摘要，不按导入顺序生成。
- Chapter 的 currentScriptVersionId 更新必须同时满足 G2 `scriptWorkingState` 形状和 rowVersion +1 触发器；working digest 与当前版本一致时才标记 clean。
- 旧 current 指针缺失时选择最高版本，但只登记 warning，不凭文件时间推断版本完成状态。

# 风险

- A3 尚未导入 `script-pending.json`、`script.revisions/latest.json`，也没有把 pending/revision 的证据写入对应表。
- A3 依赖 A2 已先创建 Project/Chapter；缺少目标实体时报告 blocked，不尝试跨切片补建业务实体。
