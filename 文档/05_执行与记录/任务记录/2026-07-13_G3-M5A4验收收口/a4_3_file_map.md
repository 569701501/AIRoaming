---
doc_id: AIR-G3-M5-A4-3-MAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前 M5 backup/restore 实现
---

# M5-A4-3 文件与函数地图

| 文件 | 责任 | A4-3 改动 |
| --- | --- | --- |
| `apps/server/src/backup/app-backup.service.ts` | coordinated backup、staging、manifest/SEALED | 真实 sentinel 扫描、release 根参与重叠门、seal 前 fail-closed |
| `apps/server/src/backup/app-restore.service.ts` | bundle verify、materialize、发布补偿 | storageKey/根路径门、bundle/恢复后扫描、rename adapter、inventory 安全清理 |
| `apps/server/src/backup/backup-path.ts` | 根与 storageKey 安全工具 | 复用或补充相对路径/越界校验 |
| `apps/server/src/backup/app-backup-restore.integration.spec.ts` | 临时 fixture 与直接验收 | A4-BAK-03/04、A4-RST-03/04 故障注入 |
| `文档/.../acceptance_checklist.md` | 状态事实源 | 仅改绿四个 A4-3 ID |
| `文档/.../progress.md`、`findings.md` | 进度与风险留痕 | 记录实现与证据 |

## 禁止触碰

`apps/server/prisma/schema.prisma`、`apps/server/prisma/migrations/**`、`apps/server/src/migration/*importer*`、Settings/Dialogue/Projects、真实 SecretStore。
