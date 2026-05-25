# 发现与决策

---
doc_id: AIR-TASK-20260523-AURORA-WORKBENCH-FINDINGS
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 关键发现

- Aurora 的工作台价值来自“多面板生产界面”，不是一个入口状态页。
- 可迁移结构包括：tabs 工具区、任务 popover、素材图库/画布、工作流面板、源文件/产物侧栏。
- AI漫游应将这些结构映射成：工作流、故事、分镜、素材、导出、AI 协作。
- 当前增强版已经迁移这些结构，但数据仍是本地 demo snapshot，还不是数据库驱动的真实项目。

## 风险

| 风险 | 处理 |
| --- | --- |
| 过度复制 Aurora 游戏/沙盒概念 | 只迁移交互结构，内容换成 AI漫游漫画/轻漫剧主线 |
| UI 先行导致后端空壳 | 增加 project workbench 快照 API，让数据边界先存在 |
| 用户预期完整 Aurora 级能力 | 明确这是工作台形态迁移，不是完整素材生成/沙盒/计费系统迁移 |
