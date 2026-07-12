---
doc_id: AIR-G3-M3-A8-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G1 迁移字典与 G3-M3 施工包
---

# G3-M3-A8 资产元数据导入计划

## 目标

从 sealed snapshot 的 `projects/{legacyProjectId}/shared/assets.json` 导入稳定 Asset 身份、章节归属、类型、角色、MIME 推断和 `meta` JSON 摘要。

## 边界

- 资产只写入 `staged`，不伪造 `sha256`、bytes、尺寸或 `readyAt`。
- 没有物理文件证据时不创建 CharacterVisual、SceneVisual，也不设置 Character/ChapterScene current visual 指针。
- `sourceTaskId` 不从旧字符串猜测 GenerationTask 外键，保留为 null。
- `db:import --kind final` 继续 fail-closed。

## 退出标准

- A8 集成测试覆盖 metadata 导入、章节 FK、staged-only、无视觉关系和 replay 零新增。
- typecheck、server 全量测试、G1 三项门禁、CLI final fail-closed 与 diff check 通过。
- 更新 G3 handoff、会话记录、长期记忆和完成记录。
