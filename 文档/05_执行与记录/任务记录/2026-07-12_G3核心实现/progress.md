---
doc_id: AIR-TASK-20260712-G3-CORE-IMPLEMENTATION-PROGRESS
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-core 代码实现计划
---

# 进度

## 2026-07-12

- 用户授权执行 G3；按施工资料范围启动 G3-core，G3-M 保持阻塞。
- 已读取 deep-think 执行规约和 G3 施工资料；当前先执行 A0。
- A0 已完成：Shared canonical catalog/DTO、Server parser、项目领域/DB canonical 分支、Web 创建状态与错误码；workspace/shared/server/web typecheck 通过。
- A1 已完成：新增 0010 trigger、G3 overlay contract/SQLite inspection、0001～0010 ledger，并将 PrismaService 切换到 G3 startup guard。
- B0/B1 已完成主体：Create/PATCH raw body 保护、稳定错误 envelope、strict DB canonical 映射、G3 trigger mapper；DB-only 13 项集成测试通过。
- B2 已完成主体：file legacy tagged reader、\`page_horizontal\` read-only provenance 保留、ambiguity fail-closed 聚合、只读 audit CLI。
- D0 已完成主体：SourceSnapshot canonical fail-closed、CandidateGenerationSpec V2、\`sizePolicyVersion=legacy_generation_default_v1\`、persistent promptSpec/worker V2 gate、legacy layout output adapter。
- 已验证：G3 overlay/ledger/parser/mapper/file adapter 与候选规格测试通过；manifest 已重新生成并通过最终回归。
- E0 已完成：Scrutiny Review 与临时 Runtime/User Review 均通过；全量测试、workspace typecheck、manifest/schema/migration checks 全部通过。
- G3-core 已完成；G3-M 仍明确阻塞，不能宣称 production-ready。
