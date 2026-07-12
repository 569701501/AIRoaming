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
- DB full shadow 已能重建公共 `WorkbenchSnapshot`；file/DB 语义 DTO、ready Asset sha256/bytes 和 DB-only 写隔离均有集成证据。
- Dialogue runtime 的显式 pending codec/import 已完成：ScriptDialogueService 的三类 pending Map 进入 `PendingDialogueArtifact`，保留稳定 sourceKey、scope、payloadDigest 和 runtime-bundle 来源证据。

# 交给下一阶段

1. 完成 M4 正式验收签字前的最终审查，并把本目录的证据命令保持可复现。
2. 继续保持 `db:import --kind final`、M5 backup/restore 和 M6 activate fail-closed。
3. M4 签字后才进入 M5；M6 仍需 capability、SecretStore、backup 和用户授权前置。

# 当前结论

M3 full shadow orchestration 已完成，M4 仍 `in_progress`，不能作为 Luna 的 final cutover 实现依据。
