# A6 验证命令

```text
pnpm --filter @airoaming/server exec vitest run src/migration/project-chapter-shadow-importer.integration.spec.ts --maxWorkers 1 --minWorkers 1
pnpm --filter @airoaming/server exec vitest run --maxWorkers 1 --minWorkers 1
pnpm --filter @airoaming/server typecheck
pnpm --filter @airoaming/server g1:manifest:check
pnpm --filter @airoaming/server g1:schema:check
pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

结果：A2～A6 集成 9 项、server 全量 44 files / 244 tests、typecheck、G1 三项门禁和 diff check 通过。
