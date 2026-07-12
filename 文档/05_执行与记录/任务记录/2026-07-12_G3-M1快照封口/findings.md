---
doc_id: AIR-G3M1-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M1 代码探索
---

# 已确认事实

- M0 的 `MaintenanceCoordinator.createRuntimeBundle()` 目前返回内存骨架，未验证外部 sealed bundle 文件。
- `WorkspacePathService` 支持虚拟路径解析，但 M1 命令不能隐式读取默认 workspace；路径参数必须显式提供。
- 设置文件为 `/workspace/settings/app-settings.json`，包含 apiKey 等敏感字段；snapshot 必须只生成 redacted settings，不复制原文。
- 现有代码大量使用 JSON/Markdown/图片等 workspace 文件，M1 只需复制非 settings 普通文件，目录本身不进入 manifest digest。

# 风险与取舍

- M1 的 redactor 只保证已知 credential 字段和常见 secret key 结构；未知高熵秘密命中时必须失败，而不是静默复制。
- snapshot 应该拒绝源根或 staging 根 symlink，避免 realpath 后误把边界外内容纳入摘要。
- pre/post 竞态注入需要可测试 hook；生产默认不修改源文件，测试可在两次扫描间调用回调模拟变化。
