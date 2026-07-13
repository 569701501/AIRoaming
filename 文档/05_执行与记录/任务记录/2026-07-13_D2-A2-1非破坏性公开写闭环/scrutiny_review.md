---
doc_id: AIR-D2-A2-1-SCRUTINY-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: A2-1 implementation diff and review checklist
---

# D2-A2-1 Scrutiny Review

reviewer_role: Scrutiny Review（只读）  
reviewed_commit_or_diff: working tree after P1 implementation, before commit  
scope_checked: A2-1 file map, implementation contract, capability registry, shared/server/web diff  

## 结果

- 未修改 Prisma schema、0001～0010 migration、G1 generator、trigger 或 A2-2/A3/M6 模块。
- DB 写集中在 `ProjectScriptCommandRepository` 与既有 G2 `ScriptVersionRepository`；多表命令使用 `VersionTransactionRunner`。
- `ProjectRepository.refreshProjectFromDatabase()` 只读 Prisma 并替换单项目 identity-map，不扫描 workspace。
- metadata 仅写允许字段；显式 `sourceText` 在 DB 模式稳定拒绝；ensure order 幂等且并发依靠唯一约束/事务重试。
- pending 创建不改 Working/current/ScriptVersion；adopt/discard 不创建 ScriptVersion；publish 才创建历史版本。
- outline 为 append-only draft，confirm 使用 expected outline ID，旧 confirmed 只转 archived。
- Web DB/file 分支使用 capability；DB 旧写路由返回 `LEGACY_WRITE_ROUTE_DISABLED`；CAS 取自已观察 DTO。
- capability 只变更 5 个目标 operation，聚合 capability 仍 partial，blockedIds 仍为 6。

commands_and_results:
- `vitest run src/projects/project-db-persistence.integration.spec.ts`: 14/14 PASS
- `vitest run src/projects/projects.service.source-guard.spec.ts src/migration/db-capability-registry.spec.ts`: 13/13 PASS
- `vitest run src/migration/project-chapter-shadow-importer.integration.spec.ts`: 58/58 PASS
- workspace typecheck、web build、Prisma validate、G1 三项 check、`git diff --check`: PASS

evidence_test_ids:
- `src/projects/project-db-persistence.integration.spec.ts#D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable`
- `src/projects/project-db-persistence.integration.spec.ts#persists the public create/draft/complete path across a Nest restart without a workspace project tree`

findings: 无 P0/P1；schema check constraint 导致缺失 Conversation FK 时 provenance 三字段全 null，已记录为 A2-A5 交接风险。  
residual_risks: A2-2 clear/import/reset 尚未实现；真实根、真实 provider、真实凭据仍未触碰。  
verdict: PASS
