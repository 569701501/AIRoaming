---
doc_id: AIR-D2-M6-TASK-SCRUTINY-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, human, ai-agent
source: M6 静态复核
---

# Scrutiny Review

> 复核撤回：后续独立检查发现 restore 仅接受 coordinated/shadow、activate 未绑定同一 final backup、业务写边界未覆盖全系统。本文件的 passed 只保留为历史记录，当前结论为 `changes_requested`。

## 结论

`changes_requested`。进入 `../2026-07-13_M6-A1真实切换验收补强/handoff.md` 后重新复核。

## 检查

- dry-run 无 PersistenceState update；execute 只允许 ready→db_only，触发器继续保护身份与时间戳形状。
- backup 通过既有 `AppRestoreService` verify-only 校验，临时目标父目录在系统临时根内创建并清理。
- metadata archive 拒绝 symlink、非空目标和秘密 sentinel，不复制 Asset 内容。
- 首写标记和业务写位于同一 Prisma transaction；业务异常在标记前抛出。
- CLI 旗标重复、缺失、相对路径、错误 gate/mode 均 fail-closed。

## 未发现

- 未新增真实凭据读取、默认路径、自动 down migration 或真实切换旁路。
