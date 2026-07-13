---
doc_id: AIR-G3-M5-A4-3-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 实施契约第 3、4 节
---

# M5-A4-3 实施契约

## 1. Sentinel 扫描

测试 sentinel 至少覆盖 `airoaming-test-secret-<runId>`、`sk-...`、`Bearer ...`。扫描值而不是字段名：合法 `secretRef`、schema 名称和 `included=false` 不得单独触发。

扫描范围：

- backup seal 前：manifest、settings.redacted、run-summary、full-shadow report、bundle DB 所有 TEXT/BLOB 值、所有 Asset bytes；
- restore verify/materialize 前：同一 bundle 范围；
- materialize 后：恢复 DB 所有 TEXT/BLOB 值和 workspace 文件。

命中统一使用现有 `BACKUP_SECRET_DETECTED` 或 `BACKUP_SECRET_DETECTED` 对应 restore fail-closed 错误，不得写 SEALED 或留下不安全目标。

## 2. 路径门

所有根使用显式绝对路径；existing root 必须非 symlink，target 必须不存在且 parent 非 symlink。backup 的 release/data/workspace/output 与 restore 的 backup/release/data/workspace 两两不得祖先/后代重叠。storageKey 必须是相对 POSIX 路径，拒绝空段、`.`、`..`、反斜线、绝对路径和解析后越界。

## 3. 补偿安全

materialize 的第一根发布后记录 marker 和完整 regular-file inventory digest。第二根发布失败时：

1. marker 不匹配、inventory 变化、symlink/special file 或目录读取失败 → 保留第一根，返回 `RESTORE_COMPENSATION_UNSAFE`；
2. marker 和 inventory 完全匹配 → 仅删除本次第一根，再返回原始发布失败；
3. staging 只在 marker 匹配时删除；不得递归删除外部目录。

允许通过构造器注入小型 rename adapter 进行确定性第二次 rename 失败测试，生产默认仍使用 `fs.rename`。

## 4. 非目标

不修改 schema/migration/trigger/importer/SecretStore，不实现 A4-4 全量 rehearsal、final importer、pre-cutover 或 activate。
