---
doc_id: AIR-G3M0-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M0 代码探索
---

# 已确认事实

- `AppModule` 当前未导入 MaintenanceModule；业务模块分别提供 Projects、Dialogue、Tasks、Settings、ToolCallback 服务。
- `ProjectStore.writeProjectFiles` 是项目文件/持久化写入的集中入口，适合挂接 project mutation lease。
- `TasksService.create/cancelForApi`、`DialogueService.sendMessage/streamMessage`、`SettingsService.updateSettings` 是当前可识别的主要写入口。
- PersistentTaskWorkerService 的 `runOnce` 是 DB worker 执行入口，必须在 draining 时拒绝新的 claim。
- 当前 `main.ts` 没有绑定 loopback，因此管理 controller 必须同时校验 socket remoteAddress 与显式 token file。
- `@airoaming/shared` 没有现成通用 canonical JSON helper；bundle digest 在 maintenance 模块内使用稳定递归 canonicalization。

# 风险

- 既有服务存在文件模式与 DB 模式双路径，M0 只能在集中入口加 lease，不能声称已覆盖所有外部副作用。
- runtime bundle 只做骨架，必须显式包含 `unobservableBeforeBridge`，不能把骨架当作可导入快照。
