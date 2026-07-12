# A5 验证命令

以下命令在 `/Users/liyadong/selfProject/AIRoaming` 执行：

```text
pnpm --filter @airoaming/server exec vitest run src/migration/project-chapter-shadow-importer.integration.spec.ts --maxWorkers 1 --minWorkers 1
pnpm --filter @airoaming/server typecheck
pnpm --filter @airoaming/server g1:manifest:check
pnpm --filter @airoaming/server g1:schema:check
pnpm --filter @airoaming/server g1:migration:check
git diff --check
```

结果：A5 集成 8 项（含既有 A2/A3/A4 链路与新增 A5-01/A5-02）通过；server typecheck 与 G1 三项门禁通过；diff check 通过。随后执行 server 全量 44 files / 243 tests 通过。
