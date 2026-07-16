---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-ENHANCEMENT-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 事实发现

- 当前 B2 把全部 block 原文一次放入 Prompt；服务端不截断，但超出模型上下文时只能失败，尚无分层路径。
- 当前目录确认同步调用 `ScriptImportBatchService.run()`，确认请求会等待全部章节的 materialize/verify。
- `ScriptImportBatchItem` 已有 queued/materializing/verifying/pending_ready/generation_failed/confirmed、attempt、error 和 rowVersion；触发器允许 generation_failed → materializing。
- 当前批次结果只保存在当次对话 ToolResult 中，缺少实时批次查询；失败项没有公开重试 API。
- 主进程已有显式启动 `PersistentTaskWorkerService` 的模式，可为专用导入 worker复用相同启动/停止方式。

# 风险

- 0017 import batch 没有 lease owner/token；专用 worker必须按当前本地单服务进程假设工作，并依赖状态 CAS 防止重复落稿，不能宣称多实例分布式安全。
- 分层合并仍受最终 JSON 本身大小约束；当最终结构输出超出模型限制时必须失败并保留原稿，不得降低覆盖要求。
- 页面轮询必须在离开项目、切换线程或批次终态时停止，避免重复请求和旧结果覆盖新线程。

# 最终结论

- B2 短稿保持单次分析；长稿按稳定 block 预算分叶，叶子与合并各使用隔离模型 session，相邻递归合并后对全 block 做完整分配校验。
- B3 确认只创建目录、章节入口和 queued 批次并立即返回。
- B4 Worker 启动恢复一次、新任务主动唤醒、批次内连续领取；空闲不轮询 SQLite。中断尝试明确失败并在 3 次上限内从本章起点恢复。
- 页面只轮询 queued/processing；失败项可单章重试，成功 pending 和正式章节不受影响。
- 当前不解决多实例 lease；最终 JSON 超限仍 fail-closed。
