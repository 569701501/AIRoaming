# Handoff：视觉素材门禁前置

---
doc_id: AIR-TASK-20260719-VISUAL-PREFLIGHT-HANDOFF
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md、scrutiny_review.md、runtime_review.md
---

## 已完成

- 视觉素材要求由共享 `level + entityType` 策略在剧情结构阶段固定。
- 剧情结构页按类型显示人物定稿、单张参考或无需图片。
- 分镜生成和持久化均拒绝当前确认结构之外的角色。
- 出图准备 v2 只检查，不生成、不修复、不按出镜次数升级要求。
- v1 历史预检可读但不再作为 current 继续生产。
- creature/group 使用类型适配的 OpenCodeAI Skill Prompt；voice 不创建图片任务。
- group 保守别名复用同一素材身份，兼容旧项目页面投影。
- 自动验证、静态复核和真实页面复核均通过。

## 未做

- 没有引入通用道具/物件 Elements 模型。
- 没有删除 file 兼容层的历史 resolve API。
- 没有静默修改或删除旧的正式结构版本和 Character 行。
- 没有调用付费图片服务。

## 后续建议

下一步单独讨论 `prop/object/location/style` 是否需要统一视觉元素模型；不要继续把复杂物件塞进 creature，也不要改变本次已冻结的角色素材合同。
