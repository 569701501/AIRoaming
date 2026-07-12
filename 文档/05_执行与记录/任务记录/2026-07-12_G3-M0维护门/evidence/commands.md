---
doc_id: AIR-G3M0-EVIDENCE-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: G3-M0 验证命令
---

# 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @airoaming/server test -- maintenance/maintenance-coordinator.spec.ts` | 6 tests passed |
| `pnpm --filter @airoaming/server test` | 37 files / 201 tests passed |
| `pnpm --filter @airoaming/server typecheck` | passed |
| `pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK` |
| `pnpm --filter @airoaming/server g1:schema:check` | `G1_PRISMA_SCHEMA_OK` |
| `pnpm --filter @airoaming/server g1:migration:check` | `G1_MIGRATIONS_OK`, 8 migrations / 195 checks / 194 triggers |

未提交真实 token、workspace、DB 或 bundle 内容；M0 bundle 只在测试/CLI 输出时生成脱敏骨架。
