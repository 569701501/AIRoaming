---
doc_id: AIR-D2-A3-2A-CHAR-TASK-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: P4 task/source contract
---

# 实施契约

- task type 为 `character_reference_generate`，target 为 Character，scope 不伪造 chapter。
- `input.sourceProjection` 只包含当前 Character identity digest；`GenerationTaskSource` 与 input canonical projection 一致。
- `sourceSetSealedAt` 必须在创建事务中落下；重复同一输入返回原 task，`createdCount=0`。
- 任务创建不触碰 workspace/provider/Keychain；后续 worker 只能通过 claim/source fencing 生成 staged Asset。
