---
doc_id: AIR-G3-M3-A0-PROG-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: 本次执行记录
---

# 进度

## 2026-07-12

- 新增 `migration-ledger.ts`：run 状态机、issue 生命周期、来源冲突、provenance 单调升级、稳定 entityId。
- 新增 `migration-audit.service.ts`：验证 `SEALED`/source manifest/snapshot manifest，校验 payload 原始 digest，扫描 `projects/*/project.json` 并复用 M2 mapper/issue/report codec。
- 新增 `migration-audit.cli.ts` 与 `migration:audit:check`。该命令是 M3-A0 审计 CLI，不等同最终 `db:audit`，不写 DB。
- 新增 7 项定向测试，覆盖 RUN-01/02/03、来源冲突和 AUDIT-01/02/03。
- 首次全量测试因 package script 改动使 G1 manifest 过期；重新生成 manifest 后恢复通过。

# 当前状态

M3-A0 代码、验证、静态复核和文档交接完成；完整 importer、Prisma ledger repository、`db-import`/`db-verify` 仍未实现。
