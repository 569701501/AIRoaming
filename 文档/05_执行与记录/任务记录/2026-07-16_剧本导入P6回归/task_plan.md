---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-P6-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 双流程来源与状态契约的 P6 后续建议
---

# 剧本导入 P6 回归任务计划

## 目标

补齐已有剧本导入链路三个高风险边界的固定回归：

1. 多文件相邻内容可以组成同一生产章节，不把文件边界强制当成章节边界。
2. 长稿最终合并 JSON 超限或截断时明确失败，不回退为不完整目录。
3. 服务在章节整理中断后，使用同一数据库的新应用实例能够从该章起点恢复。

## 非目标

- 不改变 A/B 两条产品流程。
- 不新增页面字段或用户动作。
- 不建设多实例 lease。
- 不改变数据库 Schema、Prompt 输出 Schema 或 StoryStructure。
- 不访问真实外部模型，模型边界继续使用受控 fake。

## 阶段

| 阶段 | 角色 | 内容 | 状态 |
| --- | --- | --- | --- |
| P6-1 | Orchestrator | 读取事实源、代码与现有测试，冻结验收边界 | completed |
| P6-2 | Worker | 增加多文件跨边界与最终 JSON 截断测试 | completed |
| P6-3 | Worker | 增加真实 SQLite + 新应用实例的中断恢复集成测试 | completed |
| P6-4 | Worker | 运行聚焦、全量、类型和构建门禁 | completed |
| P6-5 | Scrutiny Review | 只读复核契约、测试真实性和变更范围 | completed |
| P6-6 | Runtime/User Review | 判断是否需要页面复核并形成结论 | completed |
| P6-7 | Orchestrator | 同步测试文档、完成记录、记忆并提交 | completed |

## 强制验收标准

- 跨文件候选必须使用两个真实 `sourceRef` 范围，最终全原稿覆盖校验通过。
- 最终合并输出连续两次无效时，分析 Promise 必须拒绝，不能返回叶子分析拼接结果。
- 中断恢复必须使用真实临时 SQLite，并关闭、重建 Nest 应用上下文；恢复后仅同一章节 `attempt` 增加且重新进入 `materializing`。
- 现有聚焦测试、Shared/Server 全量、typecheck 和 build 通过。
- 文档明确测试证明的边界，不把“新应用实例 + 同一 DB”夸大为真实 OS kill 或多实例安全。

## 退出标准

- 所有阶段完成。
- Scrutiny Review 与 Runtime/User Review 有明确结论。
- 测试体系、任务记录、完成记录和长期记忆完成同步。
- 提交后工作区清洁。

## 当前角色边界

- Orchestrator：只冻结范围和验收标准。
- Worker：只增加 P6 测试及测试所揭示的最小必要修复。
- Scrutiny Review：只读，不修改代码。
- Runtime/User Review：本轮无页面行为变化，优先用真实数据库集成路径判断；若不需要浏览器复核，必须说明原因。
