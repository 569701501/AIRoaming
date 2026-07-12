---
doc_id: AIR-G3M2-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M 导入器决议与迁移账本施工包
---

# 目标

完成 G3-M2：comic-format legacy mapper、MigrationIssue detail/resolution codec、migration decisions artifact 和稳定校验 CLI。

# 允许范围

- `apps/server/src/migration/comic-format-migration.plugin.ts`
- `apps/server/src/migration/migration-decision.ts`
- `apps/server/src/migration/migration-issue.ts`
- `apps/server/src/migration/migration-report.ts`
- M2 tests、`migration:decisions:check` package script、任务文档

# 禁止范围

- importer、MigrationRun repository、Prisma 写入、audit/shadow/final/verify
- backup/restore/activate、SecretStore、真实 workspace
- 修改 G3 enum、Prisma migration 0010 或旧 runtime reader

# 验收标准

1. MAP-01～08：canonical、page_horizontal、four_panel、missing、invalid、安全预览和 runtime isolation 规则固定。
2. DEC-01～04：空 decisions digest、合法 four_panel 两种决议、未知/重复/乱序/伪造 intent 拒绝、sourceDigest 变化拒绝。
3. decisionsDigest 使用共享 `digestCanonicalJson`，排除自身字段。
4. issue detail/resolution JSON 只允许稳定字段，不序列化任意旧对象或 secret。
5. CLI 需要显式 snapshot/input/output，输出稳定 code/digest，不写数据库。

# 退出标准

- M2 定向测试、server 全测、typecheck、G1 三项 check、git diff --check 通过。
- handoff、scrutiny_review、runtime_user_review、完成记录和 evidence 已更新。
