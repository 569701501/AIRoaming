---
doc_id: AIR-G2-F4-PROGRESS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F4 implementation
---

# 已完成

- 新增 `PersistentG2TaskCreateGuardService`：DB 模式统一处理四类 G2 任务；客户端只提供目标和候选数量，服务端重新读取版本链并冻结 input/source projection。
- `shot_prompt_generate` source set 固定包含 `storyboard_version`、`shot`、`preflight_revision`，并按已确认 Preflight 快照追加有效角色/场景视觉来源。
- `image_generate` input 固定 `promptSpec`、JCS `generationSpecDigest`、`requestId`、候选数量和尺寸；仓储再次校验 digest 与 promptSpec 一致。
- `PersistentTaskRepository` 修正 story/shot 的 `llm-provider` 并发键，并按注册表模板生成四类幂等键；source rows 按 storyboard 依赖优先插入以满足 SQLite 触发器。
- `PersistentTaskWorkerService` 新增 prompt/image handler、strict output、provider 调用、图片文件写入、Asset staged→ready、Candidate 创建和 historical/cancelled 隔离；不更新 current candidate lock。
- `TasksService` 的 DB API 已通过 ProjectsService 接入统一创建门禁；file mode 兼容路径保持不变。

# 证据

- `project-db-persistence.integration.spec.ts` 新增 fresh SQLite 场景：统一创建、prompt current、image Asset/Candidate、无 current lock 变更、storyboard 替换后的 prompt historical。
