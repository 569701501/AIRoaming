---
doc_id: AIR-G2-F4-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 F4 implementation
---

# 关键发现

1. `shot` source 的 SQLite seal 触发器需要先看到同任务的 `storyboard_version` source；canonical projection 仍按 role 排序，但 repository 写 source rows 时必须把 storyboard 依赖先插入。
2. `Asset` 不能直接 INSERT ready。worker 先写 `staged`，再在完成事务中补 sha256/bytes/尺寸和 readyAt，随后转 `ready` 并创建 Candidate。
3. image 结果属于候选历史，不属于当前锁定。即使 applicability 为 historical，候选和资产仍可审计落库，但不允许改 `Shot.currentCandidateLockRevisionId`。
4. `generationSpecDigest` 采用 shared JCS/SHA-256，不能继续复用旧 file-mode 12 位 SHA-1 摘要。

# 残留风险

- 默认 image handler 依赖运行时 image provider 配置；自动化证据使用 deterministic handler，真实 OpenCode/image provider smoke test 仍未执行。
- G1 已有 Outbox handler 注册表，但当前 F4 完成事务直接执行 staged→ready，独立 Outbox consumer 仍是后续切片。
