---
doc_id: AIR-G3-M5-A4-PLAN-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5 独立代码复核、原 implementation_contract/acceptance_checklist 与 G1 BAK/RST 契约
---

# G3-M5-A4 任务计划：备份恢复验收收口

## 1. 当前阶段

`ready_for_development`。

M5-A0～A3 已有实现且现有 11 个定向测试、server typecheck 通过；但原清单对 BAK-02/03、RST-01/03 的完成判定超出真实证据，且静态复核发现会影响协调备份一致性和恢复可信度的实现缺口。M5 从 `completed` 退回 `hardening_required`，完成 A4 前不得推进 D2/M6。

## 2. 目标

1. 让 backup manifest、DB 副本、Asset inventory、migration ledger 和 PersistenceState 来自同一写入栅栏内的稳定状态。
2. 让 restore 精确核对 16 条 MigrationRun、run-summary、PersistenceState 和当前 release effective identity，而不是只检查表存在。
3. 补齐 secret、路径、篡改、活动 writer/WAL、第二根发布失败和 CLI 额外参数的 fail-closed 证据。
4. 重新执行临时根 backup → verify → materialize → restart/API 演练，再决定 M5 是否恢复 `completed`。

## 3. 非目标

- 不实现 `db:import --kind final`、`app:backup --kind pre-cutover` 成功路径或 `db:activate`。
- 不补 Settings/SecretStore、Layout/Export、Dialogue、Project delete 等 D2 capability。
- 不改 `schema.prisma`、0001～0010 migration、trigger、G1 manifest 或 release identity 规则。
- 不访问真实 workspace、真实 DB、真实 Keychain/SecretStore。
- 不用增加审查流程代码替代生产修复与故障注入测试。

## 4. 子切片

| 子切片 | 内容 | 退出条件 |
| --- | --- | --- |
| M5-A4-1 | backup 一致性栅栏 + backup/restore CLI 精确参数 grammar | manifest/DB/Asset/ledger 全在同一 fence 内读取或末尾复核；活动 writer 与额外 positional 测试通过 |
| M5-A4-2 | restore 账本、run-summary、PersistenceState、release identity 精确核对 | 16 run 顺序/身份/计数/issue 与 current release 全绑定；任一篡改失败 |
| M5-A4-3 | secret/path/补偿清理故障矩阵 | DB/Asset/run-summary/restored roots sentinel=0；symlink/重叠/越界/第二 rename 失败安全 |
| M5-A4-4 | 全量回归、临时重启/API rehearsal、双 Review | A4 清单全绿；原 M5 文档纠正；独立提交与证据齐全 |

当前只把 `M5-A4-1` 交给 Luna。

## 5. 代码边界

```text
apps/server/src/backup/
  app-backup.service.ts
  app-restore.service.ts
  app-backup.cli.ts
  app-restore.cli.ts
  backup-path.ts
  backup.types.ts
  app-backup-restore.integration.spec.ts
  （允许按职责拆分新的 *.spec.ts 或小型内部 helper）
apps/server/src/migration/credential-redactor.ts
  （仅 A4-3 如需抽取共享的非泄密检测器时允许）
本任务目录 progress/findings/acceptance/evidence
```

禁止修改 importer、verifier、Repository、Settings、Prisma Schema/migration/trigger。

## 6. 统一退出门

- 参数非法必须在 Prisma 初始化、创建目录和写文件前失败。
- 成功 bundle 的所有 DB 派生字段必须与被复制 DB 的内容精确一致。
- `verify-only` 必须零目标写入；`materialize` 只接受两个不存在且不重叠的目标根。
- 任一失败不得留下可被 restore 接受的 `SEALED` bundle。
- marker 只能证明目录归属，不能单独证明目录未被外部修改；补偿删除前必须验证预期 inventory/digest。
- 任何无法确定的行为保持 fail-closed，不通过放宽检查或修改测试期望解决。

## 7. 完成定义

M5-A4-1～A4-4 全部独立提交、acceptance 清单无 `not_run/partial`，Scrutiny Review 与 Runtime/User Review 通过，才能把 M5 恢复为 `completed`。M5 完成仍不等于 D2 或 M6 完成。
