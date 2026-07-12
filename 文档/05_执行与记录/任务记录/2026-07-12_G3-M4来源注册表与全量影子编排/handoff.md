---
doc_id: AIR-G3-M4-REGISTRY-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M4 continuation
---

# 已交付

- 来源证据注册表和 M4 verifier 校验已落地。
- `db:import --kind shadow --slice full --workspace-root <workspace-root>` 已提供 16 slice 编排；可选 `--run-id-prefix` 生成可读的独立 run IDs。
- full replay 已覆盖 Asset ready/physical evidence 后置增强场景。

# 交给下一阶段

1. 补齐 pending Dialogue artifact 与真实 read-model/API DTO 对照。
2. 在 fresh DB 上执行正式双轮 full shadow，并逐表固定 ledger/entity/pointer inventory。
3. 补 Asset 物理文件 hash 与 file-mode/DB-mode API 响应等价检查。
4. 完成后才能进入 M5 backup/restore；`final` 与 M6 activate 继续保持 fail-closed。

# 当前结论

M3 full shadow orchestration 已完成，M4 仍 `in_progress`，不能作为 Luna 的 final cutover 实现依据。
