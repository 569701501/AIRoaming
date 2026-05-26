# 发现与决策

---
doc_id: AIR-TASK-20260526-PROJECT-ROUTER-FINDINGS
status: completed
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 关键结论

- 项目库和项目工作区是两个页面层级，应由 URL 表达。
- 路由不会天然导致状态丢失；状态丢失来自把未保存草稿只放在组件内部。
- 当前路由骨架先解决位置恢复，未保存草稿保护应作为单独功能补上。

## 当前路由

```text
/projects
/projects/:projectId
/projects/:projectId/script
/projects/:projectId/structure
/projects/:projectId/storyboard
/projects/:projectId/candidates
/projects/:projectId/layout
/projects/:projectId/assets
```

其中 `/projects/:projectId` 重定向到 `/projects/:projectId/script`。

## 状态边界

| 内容 | 归属 |
| --- | --- |
| 当前页面位置 | URL |
| 当前项目 ID | URL + store 当前态 |
| 当前步骤 | URL + store 当前态 |
| 项目快照 | Pinia / API |
| 对话线程 | Pinia / API，按 `projectId + stepKey` |
| 剧本正文事实 | 后端项目草稿 / workspace |
| 未保存编辑草稿 | 后续应放 store 或离开保护 |
