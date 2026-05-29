# 首页设置 AI 密钥与外观功能发现

---
doc_id: AIR-TASK-SETTINGS-FINDINGS-001
status: in_progress
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 代码探索与 AuroraPlatformWeb 参考
---

## 需求理解

用户希望在首页设置模块中增加：

- AI 密钥配置。
- 外观设置。
- 参考 AuroraPlatformWeb 的设置页做法。

## 研究发现

### AI漫游现状

- `apps/web/src/components/layout/AppSidebar.vue` 已有 `设置` 导航项，但没有路由行为。
- `apps/web/src/router/index.ts` 只有 `/projects` 和项目工作区路由。
- `apps/web/src/components/layout/AppShell.vue` 在非项目路由时总是渲染项目库，需要识别 settings 路由。
- `apps/server/src/ai-runtime/opencode-runtime.service.ts` 当前只从环境变量读取默认模型；尚无用户设置模块。
- `WorkspacePathService` 可把 `/workspace/...` 映射到本地 workspace，可用于保存本地全局设置。

### AuroraPlatformWeb 参考

- `apps/web/src/pages/SettingsPage.vue` 使用左侧 tab，包含 `AI 密钥` 和 `外观设置`。
- AI 密钥通过 provider catalog + provider credentials API 管理，前端提交完整 key 后只展示 credential 指纹。
- 主题通过 `stores/theme.ts` 保存到 localStorage 并应用到 `document.documentElement.classList`。
- Aurora 的团队/个人 BYOK、计费、沙盒重启和 Agent 模型设置对 AI漫游当前 MVP 过重，不宜整体迁移。

## 技术决策

- AI漫游先做本地单用户 `settings` 模块，而不是迁移 Aurora 的用户/团队 credential 模块。
- `AI 密钥` 只用于当前对话 OpenCode 默认 provider，先聚焦 OpenAI-compatible：`providerId`、`modelId`、`baseUrl`、`apiKey`。
- API 响应不返回 `apiKey` 原文。
- 外观设置使用 `system/light/dark`，保存在后端设置中，前端立即应用。
- `workspace/settings/*` 已加入 `.gitignore`，只保留 `.gitkeep`，避免本地密钥文件进入仓库。

## 缺口和风险

- OpenCode 运行中的 serve 进程是否会立即读取新配置，需要实现后验证。若 OpenCode 本身不热更新，则保存设置后至少保证 AI漫游后端默认模型和后续新会话参数正确。
- 本地 workspace 文件保存 API Key 属于开发期能力，后续接桌面壳或多用户时应替换为系统 keychain、加密存储或数据库加密字段。

## Scrutiny Review

- 静态检查确认 `AppSettings` 响应 DTO 不包含 `apiKey` 字段。
- `SettingsService.toPublicAIKey` 只返回 `configured`、`keyPreview`、`keyFingerprint` 和更新时间。
- `.gitignore` 已排除 `workspace/settings/*`，降低本地密钥误提交风险。
- `shared/server/web` 类型检查均通过。

## Runtime/User Review

- settings API 冒烟验证：保存测试 key 后 GET 响应未包含完整 key，并已清空测试 key。
- 外观设置 PATCH 到 `light` 成功，再恢复 `dark` 成功。
- Vite `/settings` 路由返回 200，开发服务已启动。
