---
doc_id: AIR-G2-F4-HANDOFF-001
status: ready
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F4 completion evidence
---

# Handoff

F4 已闭合四类 G2 task 的 DB 创建门禁和 worker completion seam。后续实现应继续复用 `PersistentTaskWorkerService.completeClaim` 的 lease/applicability/transaction 边界，不直接写 current 指针或绕过 `PersistentTaskRepository`。

## 下一步

- 以真实 provider 配置执行一次 prompt/image smoke test，记录 provider、模型、输出尺寸和失败重试证据。
- 实现独立 Outbox consumer 前，保持 Asset staged→ready 的事务边界和文件清理语义；不得把 ready 资产提前暴露。
- 后续 G4/G5 候选锁定和排版只读取 Candidate/Asset，不把 image task completion 等同于用户锁定。
