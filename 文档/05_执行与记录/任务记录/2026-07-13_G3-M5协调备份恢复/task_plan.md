---
doc_id: AIR-G3-M5-PLAN-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-M 五份施工资料、G1 Secret/backup/restore 契约、M4 正式验收与当前代码
---

# G3-M5 任务计划：协调备份与空根恢复

## 1. 当前阶段

`completed`。M4 已正式通过；M5-A0～A2 工具与 M5-A3 完整 backup → restore → restart/API 演练均已通过临时根验收。M6、final import、SecretStore 与真实 production activate 继续阻塞。

M4 验收基线为 `65c90fe`；M5 开发基线以“包含本任务包的文档提交”为准，Luna 不应从 `65c90fe` 直接开工。

## 2. 目标

1. 建立诚实的 DB capability registry 与 `db:capabilities` CLI；当前未实现能力必须保持 `partial/unsupported`。
2. 实现 offline coordinated backup：一致数据库副本、全部 ready Asset、脱敏配置、迁移账本摘要和 sealed manifest。
3. 实现 sealed bundle 的 verify-only 与空根 materialize restore。
4. 在完全隔离的临时根完成 backup → restore → DB read/API smoke，并保留可复现证据。

## 3. 非目标

- 不实现或放行 `db:import --kind final`。
- 不实现 `db:activate`，不修改 `PersistenceState` 为 `ready_for_activation/db_only`。
- 不访问默认或真实 workspace、真实数据库、真实 Keychain/SecretStore。
- 不修改 `schema.prisma`、0001～0010 migration、trigger 或 release Schema identity。
- 不在 M5-A0～A3 内补齐 Settings/SecretStore、Layout/Export 写入、Project delete/Outbox 等 DB capability；只如实登记为 M6/D2 前置 blocker。
- 不把临时 coordinated backup 宣称为 `pre-cutover` 或 production-ready。

## 4. 分切片顺序

| 切片 | 目标 | 允许开始条件 | 退出条件 |
| --- | --- | --- | --- |
| M5-A0 | capability registry + CLI | M4 completed | 已完成；CAP-01/02 通过；`--check` 当前稳定阻塞 |
| M5-A1 | coordinated backup | A0 提交并复核 | 已完成；BAK-01～03 通过；失败无 `SEALED` |
| M5-A2 | verify-only/materialize restore | A1 提交并复核 | 已完成；RST-01～03 通过；只恢复到不存在的空根 |
| M5-A3 | backup/restore rehearsal | A2 提交并复核 | 已完成；RST-04、server 全量、typecheck、G1 门禁通过 |

一次只交给 Luna 一个切片；不得把 A0～A3 合成单次大任务。

## 5. 计划代码边界

```text
apps/server/src/migration/
  db-capability-registry.ts
  db-capability-registry.spec.ts
  db-capabilities.cli.ts
apps/server/src/backup/
  backup.types.ts
  backup-path.ts
  app-backup.service.ts
  app-restore.service.ts
  app-backup.cli.ts
  app-restore.cli.ts
  app-backup-restore.integration.spec.ts
apps/server/package.json
```

只有 A3 确实需要启动完整 HTTP 路径时，才允许新增：

```text
tests/e2e/api/g3m-maintenance-cutover.spec.ts
```

不得为了 M5 改 importer、verifier、Prisma Schema 或现有 migration。

## 6. 统一退出门

- 所有路径必须显式绝对路径；拒绝 symlink、重叠根、越界 storageKey 和默认真实根。
- 所有 CLI 只接受单个 `--format json`，参数错误必须在连接 DB、创建目录或写文件前 fail-fast。
- 成功 bundle 最后写 `SEALED`；任何失败均不得留下可被 restore 接受的 bundle。
- ready Asset 必须逐项匹配 DB `storageKey/sha256/bytes`；missing Asset 只能进入报告，不能伪装 ready。
- bundle、DB、报告、日志和 restored roots 的 fake secret sentinel 扫描为 0；fake secret store 本身除外。
- `app:backup --kind pre-cutover` 在 capability registry 未全绿、没有 final run 或没有 ready PersistenceState 时必须返回 `MIGRATION_CAPABILITY_BLOCKED` 或更具体的稳定阻断码。
- M5-A3 完成后仍不得自动进入 M6；需另做 D2 capability/SecretStore/final importer 审查并重新取得用户授权。

## 7. Stop condition

遇到任一情况立即停止当前切片：

- 需要真实 workspace、真实数据库或真实系统 SecretStore 才能继续。
- 需要修改 Schema/migration/trigger 才能完成临时 backup/restore。
- 无法在复制期间获得 SQLite checkpoint + 排他写阻断证据。
- 输出根与 data/workspace 根存在祖先、后代或 symlink 关系。
- ready Asset 缺失、摘要不符或 bundle 命中 secret sentinel。
- 需要把未验证 capability 手填为 implemented 才能让测试通过。

## 8. 完成定义

M5 `completed` 只表示临时根 coordinated backup/restore 工具和演练通过。它不代表 capability 全绿、SecretStore 完成、final import 完成或 production cutover 可执行。
