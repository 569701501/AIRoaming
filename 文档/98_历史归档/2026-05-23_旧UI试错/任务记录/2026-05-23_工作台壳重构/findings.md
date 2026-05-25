# 发现与决策

---
doc_id: AIR-TASK-20260523-WORKBENCH-SHELL-FINDINGS
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 发现

- “项目库 -> 工作台”的页面感仍然过于管理系统。
- 用户要的是生产环境：项目列表、创建作品、AI 动作和任务队列都应嵌在工作台中。
- AI 操作应出现在右侧检查器里，不应作为独立抽象面板。
- 固定工作台壳比页面流更符合 AI漫游定位：项目是上下文，画布是主体，AI 是上下文操作。

## 风险

- 当前仍未引入真实路由和持久化，工作台状态由前端 store 管理。
- UI 需要后续视觉 QA，目前先通过构建与 HTTP 验证。
