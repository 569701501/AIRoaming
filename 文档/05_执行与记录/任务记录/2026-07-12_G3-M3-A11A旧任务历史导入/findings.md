---
doc_id: AIR-G3-M3-A11A-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: A11A 代码探索与 SQLite 集成证据
---

# 发现与取舍

- G1 `GenerationTask` 的 legacy shape 明确禁止 queued/running、retry 和 lease；旧任务只能作为历史证据存在。
- `ck_generation_tasks_json_pairs` 要求每个非空 JSON 都有正整数 schemaVersion；导入缺省时使用最小版本 `1`，不伪造 runtime V2 sourceProjection。
- `legacy_stub` 仍可作为 Candidate/Asset 的外键目标，后续 Candidate 导入必须把 generationPurpose 固定为 `legacy_unspecified`。
- artifact 通过 `redactCredentials` 后再写入 `inputJson/outputJson/errorJson`；原始 snapshot 之外不复制 secret 或重新构造 provider 输入。
- A11A 只完成任务历史基础，Candidate/Lock 仍需单独切片以便验证 asset、shot、task 三方作用域和旧 lockedCandidateId 证据。
