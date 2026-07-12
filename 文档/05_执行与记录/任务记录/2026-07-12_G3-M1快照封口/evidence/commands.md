---
doc_id: AIR-G3M1-EVIDENCE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: G3-M1 验证命令
---

# 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @airoaming/server typecheck` | passed |
| `pnpm --filter @airoaming/server test -- migration/snapshot.service.spec.ts maintenance/maintenance-coordinator.spec.ts` | 14 tests passed |
| `pnpm --filter @airoaming/server test`（Vitest 单 worker） | 38 files / 209 tests passed |
| `pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK` |
| `pnpm --filter @airoaming/server g1:schema:check` | `G1_PRISMA_SCHEMA_OK` |
| `pnpm --filter @airoaming/server g1:migration:check` | `G1_MIGRATIONS_OK`, 8 migrations / 195 checks / 194 triggers |
| `git diff --check` | passed |

`db:snapshot` 的缺参路径返回稳定 `SNAPSHOT_ARGS_INVALID`；正向 snapshot 由 SNP-01～06 使用临时三根验证。未提交真实路径、DB、workspace 或 secret。

