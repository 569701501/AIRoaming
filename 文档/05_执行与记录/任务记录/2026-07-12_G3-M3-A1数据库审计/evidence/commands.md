---
doc_id: AIR-G3-M3-A1-EVIDENCE-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: A1 命令执行结果
---

# Commands

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @airoaming/server typecheck` | passed |
| `pnpm --filter @airoaming/server exec vitest run src/migration/prisma-migration-ledger.integration.spec.ts src/migration/migration-audit.service.spec.ts src/migration/migration-ledger.spec.ts --maxWorkers 1 --minWorkers 1` | 3 files / 12 tests passed |
| `pnpm --filter @airoaming/server exec vitest run --maxWorkers 1 --minWorkers 1` | 43 files / 235 tests passed |
| `pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK`, digest `sha256:5223fd2cd19ffc9d6c21cb494ff96fa6344f21fa29750a08c0381ae5298988c5` |
| `pnpm --filter @airoaming/server g1:schema:check` | passed |
| `pnpm --filter @airoaming/server g1:migration:check` | 8 migrations / 195 checks / 194 triggers passed |
| `git diff --check` | passed |
