---
doc_id: AIR-G3-M5-A4-3-REVIEW-001
status: ready_for_review
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-3 handoff、实施契约与测试矩阵
---

# M5-A4-3 复核清单

- [ ] sentinel 扫描来自真实 DB/Asset/report/settings/run-summary 内容，不按字段名误报。
- [ ] seal 前命中 sentinel 不产生 SEALED 或可接受 bundle。
- [ ] materialize 后恢复 DB/workspace 再扫描，失败有安全补偿。
- [ ] backup/release/data/workspace/output 与 restore backup/release/targets 拒绝 symlink 和重叠。
- [ ] storageKey 拒绝绝对路径、`..`、反斜线、空段和越界；复制源与目标都使用安全解析。
- [ ] 第二根发布失败时未修改第一根可清理；外部增加/删除/修改时返回 `RESTORE_COMPENSATION_UNSAFE` 并保留第一根。
- [ ] rename adapter 只在测试注入，生产默认 fs.rename。
- [ ] A4-BAK-03/04、A4-RST-03/04 各有直接故障测试，A4-1/A4-2 不回归。
- [ ] 未修改 schema/migration/trigger/importer/SecretStore，未进入 A4-4/D2/M6。

结论模板：`passed_for_a4_3` / `failed`；残留 A4-4、M5 hardening_required。
