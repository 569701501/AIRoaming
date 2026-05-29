# 首页设置 AI 密钥与外观功能任务计划

---
doc_id: AIR-TASK-SETTINGS-PLAN-001
status: in_progress
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 用户请求与 AuroraPlatformWeb 设置页参考
---

## 目标

在 AI漫游首页全局设置模块中新增两个可用功能：

1. `AI 密钥`：用户可在设置页配置对话模型使用的本地 API Key，前端只展示掩码/状态。
2. `外观设置`：用户可选择界面外观并保存，刷新页面后保持。

## 非目标

- 不迁移 AuroraPlatformWeb 的账户、团队、账单、沙盒运行时和 Agent 模型完整管理。
- 不接入远程多用户认证。
- 不在前端持久保存完整 API Key。

## 阶段

| 阶段 | 状态 | 退出标准 |
| --- | --- | --- |
| 现状探索 | done | 找到当前导航、路由、OpenCode 模型链路和 Aurora 参考实现 |
| 契约设计 | done | 明确 settings API、保存路径、前端展示字段 |
| 后端实现 | done | `GET/PATCH /api/settings` 可读写 AI 密钥状态和外观设置 |
| 前端实现 | done | `/settings` 可访问，侧边栏可切换，AI 密钥和外观设置可保存 |
| 文档与验证 | done | 类型检查通过，API/页面路径可验证，文档留痕完成 |

## 关键决策

- 设置属于本地全局配置，先保存到后端 workspace，不进入项目目录。
- AI 密钥由后端持久化，响应只返回 `configured`、`keyPreview`、`updatedAt` 等非敏感字段。
- 外观设置先支持 `system/light/dark` 三种模式；页面应用由前端执行，保存状态由后端提供。

## 验收标准

- 首页左侧 `设置` 可进入设置页。
- 设置页有 `AI 密钥` 和 `外观设置` 两个分组。
- 保存 AI 密钥后刷新仍显示已配置状态，但不显示完整密钥。
- 外观设置切换后立即生效，刷新仍保留。
- `shared/server/web` 类型检查通过。

## 当前深思熟虑角色边界

- Orchestrator：负责事实源读取、任务拆解和文档留痕。
- Worker：负责后端设置 API、前端页面和主题应用。
- Scrutiny Review：检查密钥泄露风险、DTO 契约一致性、路由和类型检查。
- Runtime/User Review：检查 API 读写、设置页可访问和外观切换行为。
