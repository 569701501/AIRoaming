---
doc_id: AIR-G3-M5-A4-4-MAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-4 运行态与全量门禁契约
---

# M5-A4-4 文件与函数地图

| 文件 | 责任 | A4-4 动作 |
| --- | --- | --- |
| `apps/server/src/backup/app-backup-restore.integration.spec.ts` | 临时 backup/restore/restart/API fixture | 增加恢复后 sentinel、maintenance、PersistenceState 直接断言 |
| `apps/server/src/maintenance/maintenance-coordinator.service.ts` | maintenance 状态/lease | 只读验证，不改生产逻辑 |
| `apps/server/src/app.module.ts`、Projects API | 恢复后启动与读路径 | 只读验证，不改生产逻辑 |
| `文档/.../acceptance_checklist.md` | A4 状态事实源 | 仅在证据齐全后改绿 A4-RST-05/A4-REG-01 |
| `文档/.../progress.md`、`findings.md` | 进度、风险与结论 | 记录全量门禁和 Review |

## 禁止触碰

Schema/migration/trigger、importer、Settings/SecretStore、真实根、D2/M6 代码。
