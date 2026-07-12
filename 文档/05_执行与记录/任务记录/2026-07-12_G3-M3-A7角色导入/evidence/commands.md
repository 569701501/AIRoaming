# A7 验证命令

```text
pnpm --filter @airoaming/server exec vitest run src/migration/project-chapter-shadow-importer.integration.spec.ts -t IMP-A7-01 --maxWorkers 1 --minWorkers 1
pnpm --filter @airoaming/server typecheck
pnpm --filter @airoaming/server g1:manifest:check
pnpm --filter @airoaming/server g1:schema:check
pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

结果：A7 定向 SQLite 集成、typecheck、G1 三项门禁和 diff check 通过；随后执行全量回归。
