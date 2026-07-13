---
doc_id: AIR-G3-M5-A4-3-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-BAK-03/04、A4-RST-03/04 acceptance
---

# M5-A4-3 可执行测试矩阵

## 1. Backup

| 子 ID | 注入 | 期望 |
| --- | --- | --- |
| A4-BAK-03A | full-shadow 缺 slice/乱序/重复或 ledger mismatch | `BACKUP_RUN_INVALID`，无 SEALED |
| A4-BAK-04A | DB 用户文本包含 `airoaming-test-secret-*` | `BACKUP_SECRET_DETECTED`，无 SEALED |
| A4-BAK-04B | ready Asset bytes 包含 sentinel | `BACKUP_SECRET_DETECTED`，无 SEALED |
| A4-BAK-04C | release/data/workspace/output symlink 或祖先/后代重叠 | `BACKUP_PATH_UNSAFE`，无 staging |

## 2. Restore path and compensation

| 子 ID | 注入 | 期望 |
| --- | --- | --- |
| A4-RST-03A | non-sealed bundle | `BACKUP_NOT_SEALED`，零 target |
| A4-RST-03B | target 已存在、symlink、祖先/后代重叠 | `RESTORE_TARGET_NOT_EMPTY` 或 `BACKUP_PATH_UNSAFE`，零写入 |
| A4-RST-03C | manifest asset storageKey 为绝对、`..`、反斜线或越界 | `RESTORE_VERIFICATION_FAILED`，零写入 |
| A4-RST-04A | 第二根 rename 注入失败，第一根未被外部改动 | 第一根安全清理，返回发布失败，staging 清理 |
| A4-RST-04B | 第二根 rename 失败前外部增加/修改第一根文件 | 保留第一根，返回 `RESTORE_COMPENSATION_UNSAFE` |

## 3. 公共断言

所有失败测试均检查 bundle 不被修改、目标与 staging 状态、错误码稳定；fixture 只位于临时根，不访问真实 DB/workspace/SecretStore。

## 4. 回归

A4-CLI-01、A4-BAK-01/02、BAK happy/missing Asset/pre-cutover、A4-RST-01/02 和既有 verify/materialize/restart/API 必须继续通过。
