# 进度日志

---
doc_id: AIR-TASK-20260526-PROJECT-ROUTER-PROGRESS
status: completed
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 会话：2026-05-26

### 完成内容

- 新增 `apps/web/src/router/index.ts`。
- `main.ts` 挂载 `vue-router`。
- `AppShell` 改为通过路由判断项目库或项目工作区。
- `ProjectLibraryView` 创建或打开项目后跳转到项目路由。
- `WorkbenchStageRail` 支持步骤选择。
- `ProjectWorkbenchView` 支持根据当前步骤展示剧本页或后续步骤占位。
- `workbench-store` 增加 `activeStepKey`，项目加载和对话线程按当前步骤读取。

### 验证

| 命令 | 结果 |
| --- | --- |
| `PATH=/usr/local/bin:$PATH corepack pnpm --filter @airoaming/web build` | 通过 |
| `curl -I http://127.0.0.1:5173/projects` | 200 |
| `curl -I http://127.0.0.1:5173/projects/example-project/script` | 200 |
| `curl -I http://127.0.0.1:5173/projects/example-project/structure` | 200 |

### 注意

- 第一次使用 Codex 自带 Node 执行构建时触发 Rollup 原生包签名问题；改用 `/usr/local/bin` 下用户本机 Node/Pnpm 后构建通过。
- 当前未做未保存草稿离开保护，这是后续需要补的交互保护。
