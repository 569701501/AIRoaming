# 任务计划：项目路由骨架

---
doc_id: AIR-TASK-20260526-PROJECT-ROUTER-PLAN
status: completed
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户请求：项目库与项目详情是否应该做路由，并要求实现
---

## 目标

为项目库和项目工作区建立前端路由骨架，让 URL 表示当前位置，Pinia 和后端负责页面数据与业务状态。

## 完成阶段

1. 读取当前 UI 信息架构、核心用户流程和现有前端状态。
2. 引入 `vue-router`。
3. 增加 `/projects`、`/projects/:projectId/script` 和后续 5 个步骤地址。
4. 创建、打开、返回和步骤切换改为路由跳转。
5. 构建验证和文档同步。

## 决策

| Decision | Rationale |
| --- | --- |
| 项目库与项目工作区必须有路由 | 支持刷新恢复、浏览器返回、深链调试和任务跳转。 |
| URL 只保存位置 | 避免把未保存草稿、对话流式状态等临时状态塞进 URL。 |
| Pinia 保留当前项目快照和步骤线程 | 页面状态和业务数据仍由 store/API 管理。 |
| 非剧本步骤先保留路由与占位 | 不伪装未完成能力，同时为后续步骤接入留稳定 URL。 |

## 验证

- `PATH=/usr/local/bin:$PATH corepack pnpm --filter @airoaming/web build`：通过。
- `curl -I http://127.0.0.1:5173/projects`：200。
- `curl -I http://127.0.0.1:5173/projects/example-project/script`：200。
- `curl -I http://127.0.0.1:5173/projects/example-project/structure`：200。
