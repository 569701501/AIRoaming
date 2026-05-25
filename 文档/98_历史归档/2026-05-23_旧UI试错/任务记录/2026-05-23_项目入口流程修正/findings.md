# 发现与决策

---
doc_id: AIR-TASK-20260523-PROJECT-FLOW-FINDINGS
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 发现

- 直接进入工作台会让产品像 AI demo，而不是创作工具。
- 工作台必须绑定项目上下文，否则任务、素材、分镜和导出都无法形成稳定归属。
- Aurora 的工作台应作为项目内页面，而不是应用首页。

## 决策

| 决策 | 依据 |
| --- | --- |
| 首页是项目库 | 用户第一步是管理和创建作品 |
| 新建项目表单包含名称、类型、简介、故事原文 | 覆盖 M1 的项目创建和故事输入入口 |
| 项目创建后自动进入工作台 | 降低路径摩擦 |

## 风险

- 当前项目是内存态，下一步必须接 Prisma 持久化。
- 还没有路由，返回项目库和进入工作台由前端状态控制；后续应引入 Vue Router。
