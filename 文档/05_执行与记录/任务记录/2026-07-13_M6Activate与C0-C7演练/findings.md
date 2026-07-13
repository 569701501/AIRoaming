---
doc_id: AIR-D2-M6-TASK-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: M6 代码、测试与 G1/M6 施工包
---

# Findings

## 关键结论

- `db:activate --dry-run` 先完整验证 final run、source/effective identity、release identity、capability 和 sealed backup，再只读返回；不会更新 PersistenceState。
- `--execute` 只允许 ACT-08，使用条件 UPDATE 在同一事务写入 `db_only + activatedAt`，不写 `firstBusinessWriteAt`。
- `firstBusinessWriteAt` 由 `PrismaService.runBusinessTransaction` 在业务事务内设置；业务回滚发生在标记前，时间戳不会残留。
- `ready_for_activation` 和 `recovery_required` 拒绝业务写；file bridge 只有显式 `AIROAMING_FILE_BRIDGE_DATABASE_URL` 才检查 DB，首写后返回 `FILE_MODE_FORBIDDEN_AFTER_FIRST_WRITE`。
- metadata archive 只复制脱敏 metadata 和 Asset storage path 清单，不复制 Asset bytes；目标根要求为空，带 marker。
- `CutoverCoordinator` 只接受 C0→C7 的下一个阶段；任何跳步或失败都不能伪造后续通过。

## 约束与残留风险

- M6 证据全部为临时根和 fake restore/SecretStore；真实 pre-cutover backup、真实停写、真实 Keychain/provider 和正式 execute 仍必须在用户单独授权后执行。
- 现有大量 DB 写服务仍逐步迁移到统一 `runBusinessTransaction`；本次至少闭合 ProjectRepository 三条公开 DB 写路径和中心边界，后续新增业务 UnitOfWork 必须复用该入口。
- `CutoverCoordinator` 负责顺序与证据，不复制 final importer/backup/restore 的领域校验。
