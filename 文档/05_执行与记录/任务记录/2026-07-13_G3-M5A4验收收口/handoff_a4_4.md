---
doc_id: AIR-G3-M5-A4-4-HANDOFF-001
status: ready_for_development
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-1/A4-2/A4-3 完成记录、M5-A4 验收清单
---

# Handoff：M5-A4-4 最终回归与正式复核

## 1. 领取范围

只领取 `M5-A4-4`：临时根 materialize 后的 secret/restart/API/maintenance 验收、全量门禁和最终 Scrutiny/Runtime/User Review。A4-1～A4-3 已完成；本轮完成后才可判断 M5 是否恢复 `completed`。

## 2. 必读顺序

1. 本文件。
2. `a4_4_implementation_contract.md`。
3. `a4_4_file_map.md`、`a4_4_test_matrix.md`、`a4_4_review_checklist.md`。
4. 同目录 `acceptance_checklist.md`、`progress.md`、A4-1～A4-3 review/runtime 记录。
5. `apps/server/src/backup/app-backup-restore.integration.spec.ts` 与现有 maintenance/API 代码。

## 3. 必须实现/验证

1. materialize 后重新扫描恢复 DB/workspace，证明 sentinel=0。
2. 使用恢复 DB 启动应用，确认 maintenance 为 closed、`GET /api/projects` 可读，且 `PersistenceState.firstBusinessWriteAt` 仍为 null。
3. server 全量测试、workspace/server typecheck、G1 manifest/schema/migration、Prisma validate、diff check 全部通过。
4. Scrutiny Review 和 Runtime/User Review 必须分别给出通过结论；明确 A4 全部 ID 已有直接证据。

## 4. 禁止

不运行真实 final/pre-cutover/activate，不访问真实 workspace/DB/SecretStore，不进入 D2/M6；不通过放宽验收或新增审查流水线解决问题。

## 5. 退出标准

A4-RST-05、A4-REG-01 及 A4-CLI-01、A4-BAK-01～04、A4-RST-01～04 全部 `passed`，M5 才能标记 `completed`。任一证据缺失则保持 `hardening_required`。
