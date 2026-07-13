---
doc_id: AIR-G3-M5-A4-3-HANDOFF-001
status: ready_for_development
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 实施契约、A4-1/A4-2 完成记录、当前 backup/restore 代码
---

# Handoff：M5-A4-3 secret、路径与补偿故障矩阵

## 1. 领取范围

只领取 `M5-A4-3`：实现真实 sentinel 扫描、显式路径安全门和第二根发布失败的安全补偿。A4-1/A4-2 已完成；本轮完成后停止，等待复核，不进入 A4-4、D2 或 M6。

## 2. 必读顺序

1. 本文件。
2. `a4_3_implementation_contract.md`。
3. `a4_3_file_map.md`。
4. `a4_3_test_matrix.md`。
5. `a4_3_review_checklist.md`。
6. 同目录 `implementation_contract.md` 第 3、4、7 节和 `acceptance_checklist.md` 的 A4-BAK-04、A4-RST-03、A4-RST-04。
7. `apps/server/src/backup/app-backup.service.ts`、`app-restore.service.ts`、`backup-path.ts` 与集成 spec。

## 3. 必须实现

1. seal 前扫描 manifest、settings、run-summary、full-shadow report、bundle DB 的 TEXT/BLOB 内容和所有 ready Asset bytes；sentinel 命中返回 `BACKUP_SECRET_DETECTED`，不得写 `SEALED`。
2. restore verify/materialize 扫描上述 bundle 内容；materialize 后再次扫描恢复 DB 和 workspace 文件，sentinel 命中 fail-closed 且不留下不安全发布根。
3. backup/release/data/workspace/output 以及 restore backup/release/两个 target 必须是显式绝对、非 symlink、两两不重叠的根；所有 storageKey 拒绝绝对路径、`..`、反斜线、空段和越界。
4. 第二根 rename 失败时，只能在第一根 marker 和完整文件 inventory/digest 仍与发布时一致时自动清理；发现外部增加、删除或修改必须保留第一根并返回 `RESTORE_COMPENSATION_UNSAFE`。
5. 允许注入仅测试用的 rename adapter；禁止生产环境开关、真实 SecretStore、Schema/migration/trigger 或 importer 修改。

## 4. 退出标准

- A4-BAK-03/04、A4-RST-03/04 每项均有直接故障注入测试。
- A4-1/A4-2 定向与既有 happy path 不回归。
- 失败路径 target/staging/sealed/发布根断言明确。
- 只把 A4-BAK-03、A4-BAK-04、A4-RST-03、A4-RST-04 改为 `passed`。

## 5. Stop

需要修改 Prisma schema/migration/trigger、访问真实根或 SecretStore、实现 final importer/pre-cutover/activate，或无法证明外部修改时不误删第一根时，立即停止。
