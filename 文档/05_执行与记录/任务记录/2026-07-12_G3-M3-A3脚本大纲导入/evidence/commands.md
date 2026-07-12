---
doc_id: AIR-G3-M3-A3-EVIDENCE-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: A3 命令执行结果
---

# Commands

| 命令 | 结果 |
| --- | --- |
| `pnpm --filter @airoaming/server typecheck` | passed |
| `pnpm --filter @airoaming/server exec vitest run src/migration/project-chapter-shadow-importer.integration.spec.ts --maxWorkers 1 --minWorkers 1` | 5 tests passed，含 A3 Outline/ScriptVersion 链路 |
| `pnpm --filter @airoaming/server exec vitest run --maxWorkers 1 --minWorkers 1` | 44 files / 240 tests passed |
| `pnpm --filter @airoaming/server db:import --kind final ...` | fail-closed，`MIGRATION_FINAL_IMPORT_NOT_READY`，exit 1 |
| `pnpm --filter @airoaming/server g1:manifest:check` | `G1_SCHEMA_MANIFEST_OK`，digest `sha256:48aa9f58854e065f5dd29233979001c7ec99eb11801c517881e2ddea558b0dfc` |
| `pnpm --filter @airoaming/server g1:schema:check` | passed |
| `pnpm --filter @airoaming/server g1:migration:check` | 8 migrations / 195 checks / 194 triggers passed |
| `git diff --check` | passed |
