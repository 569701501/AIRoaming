---
doc_id: AIR-G3-M5-A4-ACCEPTANCE-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: implementation_contract.md 与 M5R-01～08
---

# M5-A4 可执行验收清单

`not_run` 和 `partial` 均不计通过。

| ID | 场景 | 必须断言 | 初始状态 |
| --- | --- | --- | --- |
| A4-CLI-01 | backup/restore 精确参数 | extra positional、孤立 value、重复/缺失/未知 flag 均在 DB/文件写之前失败 | `not_run` |
| A4-BAK-01 | 同一一致性栅栏 | 16 run/issues/PersistenceState/Asset/settings 的读取与 DB/Asset 复制均受同一 fence 保护；manifest 与副本直查一致 | `not_run` |
| A4-BAK-02 | active writer/WAL | 既有 writer、锁后并发 writer、无法 checkpoint 或 WAL 未收敛均 `BACKUP_NOT_OFFLINE`/被阻断，且无 SEALED | `not_run` |
| A4-BAK-03 | full-shadow/ledger 故障 | 缺 slice、乱序、重复 run、report/counts/source/snapshot/decisions mismatch 任一失败 | `not_run` |
| A4-BAK-04 | Asset 与 secret | ready Asset 缺失/篡改/复制中变化失败；DB/Asset/report/settings 中任一 sentinel 失败 | `not_run` |
| A4-RST-01 | release + ledger identity | current release、16 run、固定 slice 顺序、counts/report、open issue、PersistenceState 全匹配才通过 | `not_run` |
| A4-RST-02 | bundle 篡改矩阵 | manifest/SEALED/run-summary/DB/Asset 任一字节或账本身份篡改均失败 | `not_run` |
| A4-RST-03 | 路径门 | nonsealed、目标已存在、symlink、祖先/后代重叠、storageKey 越界均零目标写入失败 | `not_run` |
| A4-RST-04 | 第二根发布失败 | 未外部修改时仅清理本 run 产物；外部修改时保留第一根并返回 `RESTORE_COMPENSATION_UNSAFE` | `not_run` |
| A4-RST-05 | materialize 后 secret/restart | restored DB/workspace sentinel=0；maintenance closed 启动读 API；firstBusinessWriteAt 仍 null | `not_run` |
| A4-REG-01 | 全量门禁 | server 全量、workspace typecheck、G1 三项、Prisma validate、diff check 全绿 | `not_run` |

## 子切片退出门

### M5-A4-1

- A4-CLI-01、A4-BAK-01、A4-BAK-02 通过。
- 原 BAK happy path 和 missing Asset/pre-cutover 回归继续通过。
- 单独提交，不继续 A4-2。

### M5-A4-2

- A4-RST-01、A4-RST-02 通过。
- restore CLI 明确携带 `--release-root`。

### M5-A4-3

- A4-BAK-03/04、A4-RST-03/04 通过。

### M5-A4-4

- A4-RST-05、A4-REG-01 通过。
- Scrutiny Review 和 Runtime/User Review 均明确签字。

## 最小命令

```text
corepack pnpm --filter @airoaming/server test -- --run <A4 定向 spec>
corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
corepack pnpm --filter @airoaming/server prisma:validate
git diff --check
```
