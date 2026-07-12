---
doc_id: AIR-G3M2-EVIDENCE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: G3-M2 验证命令
---

# 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @airoaming/server typecheck` | passed |
| `pnpm --filter @airoaming/server test -- migration/comic-format-migration.plugin.spec.ts migration/migration-decision.spec.ts` | 14 tests passed |
| `pnpm --filter @airoaming/server test`（Vitest 单 worker） | 40 files / 223 tests passed |
| `pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK` |
| `pnpm --filter @airoaming/server g1:schema:check` | `G1_PRISMA_SCHEMA_OK` |
| `pnpm --filter @airoaming/server g1:migration:check` | `G1_MIGRATIONS_OK`, 8 migrations / 195 checks / 194 triggers |
| `git diff --check` | passed |

M2 CLI 缺参路径返回稳定 `MIGRATION_DECISION_ARGS_INVALID`；本轮未提交 snapshot、DB、workspace 或 secret。

