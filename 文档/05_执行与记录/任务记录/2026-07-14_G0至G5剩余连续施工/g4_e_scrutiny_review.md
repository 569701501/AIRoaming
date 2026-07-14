---
doc_id: AIR-G4-E-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, reviewer
source: G4-E 实现、G4 候选决策契约、完整回归与浏览器证据
---

# G4-E 静态复核

## 1. 结论

```text
phase = G4-E
result = passed
commit = 3826611
next = G4_F_IN_PROGRESS
```

未发现阻塞 G4-F 的 Web 权威路径、两阶段确认、并发冲突处理或来源门禁问题。

## 2. 已复核范围

- DB Workbench 每次从数据库刷新项目身份和 Candidate 决策投影，不再用进程内旧项目快照遮蔽定稿、收藏、废弃或来源适用性变化。
- Web 的定稿、更换和 clear 全部使用 preview→用户确认→commit；旧一键 lock 调用和 Store 入口已删除。
- 任意 commit 409 都只自动重新 preview 并展示新影响，明确要求用户再次确认；不会用旧确认自动提交新 revision。
- favorite 与 current final 独立；reject/restore 不改变定稿，current final 在 Server 门禁下不可废弃。
- 排版/导出页只展示 Server 派生的 stale/incomplete/unresolved/digest 状态并禁用入口；真正安全性仍由 G4-D 的 Server 事务门禁负责。
- G4-E 没有修改画布、crop 或旧 Layout/Export/Asset；实际来源替换仍属于 G5。
- DB image task 创建和批量生成均携带唯一 `requestId`，满足任务幂等协议。
- E2E 启动器运行与生产一致的持久化任务 Worker；候选 fixture 通过公开 API 和 loopback fake provider 生成，不直接改 DB 绕过用户路径。

## 3. 不变量

1. current final 只来自 CandidateLockRevision/Shot current pointer，Web 状态不构成第二权威。
2. preview 只是只读影响计算；commit 必须带 expected revision 与 impact digest，409 后必须再次显式确认。
3. Web disabled 是用户体验，不替代 Server fail-closed gate。
4. 收藏、废弃、历史浏览和新 Candidate 不自动改变 lock set 或下游 freshness。
5. G4 只保留旧输出并派生 stale，不提前执行 G5 的画布换图、crop 或重建出版物。

## 4. 验证证据

- Server 完整回归：80 files、533/533，通过。
- Shared 完整回归：10 files、54/54，通过。
- Web build、Server/Web typecheck、E2E typecheck 通过。
- E2E 环境支持回归：31/31，通过。
- DB-only Playwright 候选决策工作台：1/1，通过。
- 静态 Web 路由断言确认旧 lock 调用不存在，两阶段 API 与用户提示存在。
- `git diff --check` 通过；无 Schema/migration 变化。

## 5. 未覆盖边界

- G4-F 继续验证 legacy direct evidence/conflict/unresolved、完整 A→B→clear→A、任务竞争、restart 与 backup restore。
- G4-F 完成总体 G4 Scrutiny 和 Runtime/User Review 后才可写 `G4_PASSED`。
- 未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
