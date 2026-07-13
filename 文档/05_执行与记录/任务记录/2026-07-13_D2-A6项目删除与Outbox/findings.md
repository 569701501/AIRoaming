---
doc_id: AIR-D2-A6-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: worker, reviewer, human
source: D2-A6 代码与测试探索
---

# 关键发现

1. G1 deleting trigger 禁止进入 deleting 后修改 `currentChapterId/currentScriptOutlineId`；intent 必须在 active 状态先解引用，再做 rowVersion CAS。
2. Outbox `processing` 事件不可直接重开；租约过期只能转 pending 并设置未来 `availableAt`，terminal failed/processed 永不重开。
3. `project.delete_files` 只允许 `projects/{projectId}` 根，manifest 必须由 DB Asset 集合重算；存在运行时任务或未结算 asset event 时拒绝/重试。
4. `asset.delete` 需同时验证 owner、storageKey、sha256，并在 unlink 前重新读取文件计算摘要；文件缺失按幂等成功处理。
5. secret 和 legacy metadata 测试使用 fake secret store/临时 workspace；没有真实 Keychain、真实凭据或真实数据。

## 残留风险

- 项目 purge 的 SQL 顺序已覆盖当前 schema 与空项目/默认项目证据；新增未覆盖的大量历史组合数据仍需在 D2-A7/A8 的 shadow/rehearsal 中继续验证。
- 默认全量 Vitest 的 5 秒慢测阈值不适合本机并发；慢测已用 30 秒阈值单独复核，不修改测试默认阈值。
