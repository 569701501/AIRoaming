---
doc_id: AIR-G3-M3-A0-EVIDENCE-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: 命令执行结果
---

# Commands

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @airoaming/server typecheck` | passed |
| `pnpm --filter @airoaming/server exec vitest run src/migration/migration-ledger.spec.ts src/migration/migration-audit.service.spec.ts --maxWorkers 1 --minWorkers 1` | 2 files / 7 tests passed |
| `pnpm --filter @airoaming/server exec vitest run --maxWorkers 1 --minWorkers 1` | 42 files / 230 tests passed |
| `pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK`, digest `sha256:2d3c536e5664a8e4c148a47befa91ddde70c51b0cdc854d74aed043b58bf42fb` |
| `pnpm --filter @airoaming/server g1:schema:check` | passed |
| `pnpm --filter @airoaming/server g1:migration:check` | 8 migrations / 195 checks / 194 triggers passed |
| `git diff --check` | passed |
