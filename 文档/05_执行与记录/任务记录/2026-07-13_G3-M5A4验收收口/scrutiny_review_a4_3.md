---
doc_id: AIR-G3-M5-A4-3-SCRUTINY-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-3 代码、测试矩阵与集成 spec
---

# M5-A4-3 Scrutiny Review

## 结论

`passed_for_a4_3`。本结论只覆盖 secret/path/compensation，不表示 A4-4 或 M5 整体完成。

## 静态复核

| 检查项 | 结论 |
| --- | --- |
| sentinel 是否扫描真实内容 | 通过；DB TEXT/BLOB、Asset bytes、JSON/report 与恢复根均扫描，按 sentinel 值而非字段名判定 |
| seal 前是否 fail-closed | 通过；扫描发生在 SEALED 写入前，命中清理 staging |
| storageKey 与根路径是否安全 | 通过；显式根、非 symlink、重叠门、相对 POSIX storageKey 和越界检查 |
| 第二根失败是否误删 | 通过；marker 加完整 inventory digest 双重确认，外部变化返回 `RESTORE_COMPENSATION_UNSAFE` |
| 测试是否直接覆盖 | 通过；32/32 集成测试，含 DB/Asset sentinel、symlink/overlap、storageKey、两类 compensation |
| 是否越权 | 通过；未修改 schema/migration/trigger/importer/SecretStore，未进入 A4-4/D2/M6 |

## 残留

A4-RST-05 与 A4-REG-01 以及 A4-4 最终双 Review仍未执行；M5 保持 `hardening_required`。
