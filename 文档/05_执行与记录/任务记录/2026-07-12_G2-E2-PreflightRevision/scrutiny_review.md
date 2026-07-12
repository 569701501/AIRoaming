---
doc_id: AIR-G2-E2-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E2 静态复核
---

# Scrutiny Review

## 结论

1. `SourceSnapshotBuilderService` 只读 scoped DB rows，角色/场景引用来自 current Storyboard 文档，source refs 经 Shared builder 排序和严格 digest 校验。
2. Preflight document 由 `encodePreflightDocumentV2` 再次解析，ready 为 true 时没有 blocked issue 且 required character 必须有完整 visual/asset/sha256 三元组。
3. `PreflightRevisionRepository.confirm` 使用 expected source storyboard ID/digest + Chapter rowVersion；写入 revision 与 current pointer 在同一个 transaction，Chapter 条件更新为 0 即冲突。
4. 0009 trigger 仍是最终数据库防线；repository 没有静默修复或绕过 trigger，也没有写 freshness/stale 列。
5. stale reason 修正为：已有 Preflight snapshot 与新 current Storyboard ID/digest 不一致时返回 `PREFLIGHT_SOURCE_STORYBOARD_CHANGED`，而不是泛化成 unresolved。

## 证据

- `corepack pnpm test`：Shared 6 specs/34 tests，Server 31 specs/178 tests，PASS。
- `corepack pnpm -w typecheck`：PASS。
- G1 schema/manifest/migration checks：PASS，8 migrations / 195 checks / 194 triggers。
- fresh SQLite E2 integration：ready preview、confirm、replay、Storyboard replacement 后 stale，PASS。
- `git diff --check`：PASS。

## 残留风险

- active reference task 查询、持久 worker、TaskApplicabilityGuard 和 capability runtime 尚未接线；E2 不可作为真实图片任务已可执行的证明。
