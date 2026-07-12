---
doc_id: AIR-G2-F4-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F4 implementation
---

# 目标

闭合 `shot_prompt_generate` / `image_generate` 的 DB 创建、来源冻结、worker 执行、产物落库和迟到隔离；不修改 G1/G2 schema。

# 退出标准

- DB API 创建任务前由服务端 `NewWorkGate` 读取 current storyboard、shot、preflight，重建严格 `TaskSourceProjectionV1`。
- prompt 任务输出不可变、可作为 image 任务的 generation spec；image 任务创建 staged Asset 与 Candidate，并在同一完成事务中安全转 ready。
- current、historical、cancelled、replay 至少有 fresh SQLite 证据；候选生成不能修改 `Shot.currentCandidateLockRevisionId`。
- 幂等键与 G1 注册表模板一致，图片任务不因迟到结果覆盖 current。

# 非目标

- 不实现 legacy task importer、Outbox worker、CandidateLockRevision 业务命令或真实外部 provider smoke test。
- 不新增 Prisma migration、表、字段或第二套任务事实源。
