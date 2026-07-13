---
doc_id: AIR-D2-A8-PROGRESS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A8 实际见证测试
---

# D2-A8 进度与证据

- [x] 两个独立 fresh target 使用同一 sealed snapshot/decisions 完成 final import。
- [x] 规范化 inventory digest、entity 语义、Asset `sha256/bytes/status` 一致。
- [x] 同 runId replay 零新增、report digest 不变。
- [x] Nest restart 后 DB Workbench DTO 与 file fixture 规范化一致。
- [x] 移走旧 metadata 后 DB 仍可读；DB Working Copy 写入不改 archived 文件。
- [x] server full migration witness 定向 12/12 通过。

## 定向证据

```text
corepack pnpm --filter @airoaming/server test -- --run src/migration/project-chapter-shadow-importer.integration.spec.ts -t 'FIN-|D2-WIT' --pool=forks --poolOptions.forks.singleFork=true --testTimeout=180000
→ 12/12 passed
```

完整 54 files/392 tests、workspace/server typecheck、web build、Prisma/G1 与 diff check 在本阶段提交前复跑。
