---
doc_id: AIR-G3-M5-ACCEPTANCE-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、implementation_contract.md、G1/G3-M 验收契约
---

# G3-M5 可执行验收清单

`not_run` 不得统计为通过。所有用例使用临时 dataRoot/workspaceRoot/SQLite/output/fake secret store。

| ID | 场景 | 必须断言 | 初始状态 |
| --- | --- | --- | --- |
| CAP-01 | 当前 capability report/check | 8 个稳定 ID 均输出；未完成项诚实为 partial/unsupported；`--check` 退出 2 + `MIGRATION_CAPABILITY_BLOCKED`；Prisma 不在参数失败前初始化 | `not_run` |
| CAP-02 | implemented 证据约束 | implemented 项必须有非空测试 ID，读/写/重启三项由对应公开 Service/API 测试覆盖；删除证据后契约测试失败 | `not_run` |
| BAK-01 | coordinated sealed backup | full-shadow artifact 正好包含有序 16 slice，聚合/nested report 可重算且 16 条 succeeded run 共享 source/snapshot/decisions 身份；checkpoint/排他写阻断成功；DB 副本 integrity/FK/ledger 通过；全部 ready Asset bytes/hash 相同；manifest 与 SEALED 可重算 | `not_run` |
| BAK-02 | fail-closed 故障注入 | 缺 slice/乱序/重复 run、artifact-ledger 摘要不一致、active writer、WAL 未收敛、ready Asset 缺失/篡改、secret sentinel、路径越界任一发生时退出非零且无可接受 SEALED bundle | `not_run` |
| BAK-03 | 路径与报告稳定性 | 不同绝对临时根的同内容 bundle 不泄漏绝对路径；资产顺序、run summary 和 manifest 字段稳定；`pre-cutover` 当前被 capability/final gate 阻塞 | `not_run` |
| RST-01 | verify-only | 完整验证 bundle、DB、Asset、ledger；目标路径保持不存在，bundle 字节不变 | `not_run` |
| RST-02 | materialize | 仅接受两个不存在目标；DB 固定恢复到 dataRoot/db/airoaming.sqlite，Asset 按 storageKey 恢复；恢复后全摘要一致、maintenance 仍 closed | `not_run` |
| RST-03 | restore 故障注入 | bundle/Asset/DB 篡改、非 sealed、目标已存在、symlink/重叠根、secret 命中均 fail-closed；只清理由本 run marker 创建的 staging | `not_run` |
| RST-04 | 恢复后重启/API smoke | 用恢复根以 DB mode + maintenance closed 启动；项目/read-model/API 与备份前规范化语义一致；旧 metadata 缺失不影响读；不产生第一笔业务写 | `not_run` |

## 回归门禁

```text
corepack pnpm --filter @airoaming/server test -- --run src/migration/db-capability-registry.spec.ts
corepack pnpm --filter @airoaming/server test -- --run src/backup/app-backup-restore.integration.spec.ts --pool=forks --poolOptions.forks.singleFork=true
corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
corepack pnpm --filter @airoaming/server prisma:validate
git diff --check
```

## 完成判定

- M5-A0：CAP-01/02 通过并单独提交。
- M5-A1：BAK-01～03 通过并单独提交。
- M5-A2：RST-01～03 通过并单独提交。
- M5-A3：RST-04 与全量门禁通过，Scrutiny Review/Runtime Review 留痕齐全。
- M5 completed 后，M6 仍保持 `prerequisite_blocked`，直到 final importer、SecretStore 和 required capability 另行全绿。
