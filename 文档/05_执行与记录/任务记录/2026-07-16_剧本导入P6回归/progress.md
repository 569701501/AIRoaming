---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-P6-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 剧本导入 P6 回归任务计划
---

# 剧本导入 P6 回归进度

## 2026-07-16

- 完成事实源、现有长稿分析测试、导入 Worker 测试和真实 SQLite Repository 集成测试探索。
- 决定用两个模型边界测试锁定跨文件与截断失败语义。
- 决定用关闭并重建 Nest 应用上下文、复用同一临时 SQLite 的方式锁定启动恢复语义。
- 当前进入 P6-2。

### P6-2 模型边界

- 在 `script-import-analysis.service.spec.ts` 增加两个真实 `sourceRef` 的跨文件连续章节用例。
- 同一候选使用文件一末块和文件二首块两个范围，严格 parser 的全原稿覆盖与全局连续性检查通过。
- 增加最终合并输出与唯一一次格式修复都被截断的用例，确认 Promise 拒绝且没有叶子目录 fallback。

### P6-3 状态恢复边界

- 在 `script-workflow-source.repository.integration.spec.ts` 使用正式 migration 和真实临时 SQLite 创建导入批次。
- 第一应用实例领取第 1 章后关闭；第二个 Nest 应用上下文复用同一数据库并运行 Worker 启动恢复。
- 第 1 章 `attempt 1 → 2` 且重新进入 `materializing`；未领取的第 2 章保持 `queued/attempt 0`。

### P6-4 验证

- 聚焦：2 files / 6 tests passed。
- Shared 全量：26 files / 153 tests passed。
- Server 单 fork 全量：102 files / 597 tests passed。
- Workspace typecheck、E2E typecheck：通过。
- Shared、Server、Web production build：通过；Web 仅保留既有大 chunk 警告。
- `git diff --check`：通过。

### P6-5/P6-6 复核

- Scrutiny Review：passed，测试只补充既有契约，不改变生产逻辑、Schema、Prompt 或页面字段。
- Runtime/User Review：passed_non_ui_integration。本轮无页面交互变化，不重复浏览器复核；真实 SQLite 新应用实例恢复路径通过。

## Handoff

- 本轮已完成并可提交。
- 后续若要求“真实 OS 强杀”证据，应新增独立子进程测试，不得把当前应用上下文重启证据改名冒充。
