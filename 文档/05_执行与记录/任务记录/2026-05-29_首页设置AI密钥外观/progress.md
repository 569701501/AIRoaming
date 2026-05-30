# 首页设置 AI 密钥与外观功能进展

---
doc_id: AIR-TASK-SETTINGS-PROGRESS-001
status: in_progress
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 任务执行记录
---

## 2026-05-29

### 阶段状态

- 现状探索：done
- 契约设计：done
- 后端实现：done
- 前端实现：done
- 文档与验证：done

### 已采取操作

- 读取项目文档入口、长期记忆、当前 UI 信息架构、OpenCode 方案和系统架构文档。
- 查看 AIRoaming 当前全局导航、路由、API 服务、OpenCode runtime、workspace 路径服务。
- 查看 AuroraPlatformWeb `SettingsPage.vue`、theme store、provider credential 类型与服务实现。
- 增加 `SettingsModule`、`SettingsService`、`SettingsController`，提供 `GET/PATCH /api/settings`。
- 增加共享 `AppSettings`、`UpdateAppSettingsRequest` 和 `AppearanceTheme` 契约。
- 增加 `/settings` 路由、`AppSettingsView` 页面、`settings-store` 和侧边栏设置入口。
- OpenCodeRuntimeService 改为读取全局设置默认模型，并在存在 API Key 时同步 OpenCode auth。
- 更新产品、架构、模块、OpenCode 方案和核心数据模型文档。
- 修复设置页成功提示跨分组残留问题：保存提示新增来源作用域，只在对应设置分组展示。

### 创建或修改文件

- `文档/会话/2026-05-29-11-49-首页设置功能.md`
- `文档/05_执行与记录/任务记录/2026-05-29_首页设置AI密钥外观/task_plan.md`
- `文档/05_执行与记录/任务记录/2026-05-29_首页设置AI密钥外观/progress.md`
- `文档/05_执行与记录/任务记录/2026-05-29_首页设置AI密钥外观/findings.md`
- `packages/shared/src/domain.ts`
- `packages/shared/src/dto.ts`
- `apps/server/src/settings/*`
- `apps/server/src/app.module.ts`
- `apps/server/src/ai-runtime/*`
- `apps/web/src/components/settings/AppSettingsView.vue`
- `apps/web/src/stores/settings-store.ts`
- `apps/web/src/services/api.ts`
- `apps/web/src/router/index.ts`
- `apps/web/src/App.vue`
- `apps/web/src/components/layout/AppShell.vue`
- `apps/web/src/components/layout/AppSidebar.vue`
- `apps/web/src/styles-premium.css`
- `.gitignore`
- `workspace/settings/.gitkeep`

### 验证命令与结果

- `corepack pnpm --filter @airoaming/shared typecheck`：通过。
- `corepack pnpm --filter @airoaming/shared build`：通过，用于刷新 shared dist。
- `corepack pnpm --filter @airoaming/server typecheck`：通过。
- `corepack pnpm --filter @airoaming/web typecheck`：通过。
- `corepack pnpm --filter @airoaming/web build`：通过，存在 Vite chunk size warning，不影响本次设置页功能。
- `GET/PATCH /api/settings` 冒烟：保存测试 key 后响应未包含完整 key，只返回 `sk-t...7890` 和指纹；随后已清空测试 key 并恢复深色主题。
- `GET /api/ai-runtime/models` 冒烟：默认模型返回 `self/gpt-5.5`。
- `GET http://127.0.0.1:5173/settings`：200。
- `corepack pnpm --filter @airoaming/web typecheck`：修复设置页提示作用域后通过。
- `git diff --check`：通过。

### 下一步

- 后续可把本地 workspace 明文密钥替换为系统 keychain 或数据库加密字段。
- 后续可在对话面板内重做可见模型选择与 variant 选择。

### Handoff

- 当前任务已完成。开发服务运行在 `http://localhost:5173/settings`，后端在 `http://localhost:4310/api`。
