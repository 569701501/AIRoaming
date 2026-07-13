---
doc_id: AIR-G3-M5-A4-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: commit 91a450c～eb26743、M5 代码与验收文档独立复核
---

# M5-A4 复核发现

## 1. 已确认可用的部分

- capability registry 有 8 个稳定 ID，并诚实保留 7 个 required blocker。
- coordinated backup happy path 能生成 manifest、DB、ready Asset、脱敏 settings、run-summary 和 SEALED。
- restore happy path支持 verify-only、空根 materialize、DB restart 与 `GET /api/projects`。
- 2026-07-13 复跑定向测试 11/11、server typecheck 通过。

## 2. 阻止 M5 正式通过的发现

| ID | 级别 | 代码事实 | 风险 |
| --- | --- | --- | --- |
| M5R-01 | P1 | `app-backup.service.ts` 先通过 Prisma 读取 runs/issues/PersistenceState/Asset/settings，之后才在 `copyDatabaseOffline()` 中 `BEGIN IMMEDIATE` | 读取事实与 DB 副本之间存在写入窗口，manifest 可能描述另一时刻的状态 |
| M5R-02 | P1 | restore 的 DB 验证只做 integrity/FK 和确认 `migration_runs/persistence_states` 两张表存在 | 被替换或不匹配的 ledger 仍可能通过恢复 |
| M5R-03 | P1 | run-summary 只验证 16 和 runId 唯一，没有与 manifest.runIds、固定 slice 顺序和 DB ledger 逐项匹配 | summary、manifest 与 DB 可各自合法但彼此不一致 |
| M5R-04 | P1 | restore 输入没有 release root，`effectiveSchemaManifestDigest` 只做格式校验 | 不兼容当前发布包的 backup 可能被 materialize |
| M5R-05 | P1 | secret 检查只遍历 manifest/settings 值，没有扫描 DB、Asset、run-summary、SEALED 和 restored roots | 清单写了 sentinel=0，但真实泄密面未覆盖 |
| M5R-06 | P1 | 第二根 rename 失败时，只要 marker 文本匹配就递归删除第一根 | 外部在发布后写入第一根时仍可能被补偿逻辑误删 |
| M5R-07 | P2 | backup/restore CLI 只拒绝未知 `--flag`，不会拒绝额外 bare positional token | “精确参数契约”和 fail-fast 证据不成立 |
| M5R-08 | P1 | 原验收把缺 slice/乱序/重复、active writer/WAL、DB/Asset tamper、nonsealed、symlink/重叠、secret、补偿失败等未执行项统一标记为 passed | 文档状态不能作为 D3 证据使用 |

## 3. 证据范围纠正

当前测试真实覆盖：

```text
CAP：4 tests
BAK：happy path、ready Asset 缺失、pre-cutover 阻断
RST：verify-only、materialize、manifest 篡改/目标已存在、重启项目列表 API
```

未覆盖项必须保持 `not_run`，不能用“服务中有检查分支”替代故障注入。

## 4. 后续阻塞

即使 M5-A4 完成，D2 仍有 7 个 required capability 未全绿；`db:import --kind final` 当前明确返回 `MIGRATION_FINAL_IMPORT_NOT_READY`，Settings 仍读写 `app-settings.json`，`db:activate` 脚本不存在。
