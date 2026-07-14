---
doc_id: AIR-G4-C-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, reviewer
source: G4-C 实现、G4 契约、0012 overlay 与数据库/API 集成证据
---

# G4-C 静态复核

## 1. 结论

```text
phase = G4-C
result = passed
commit = 179be50
next = G4_D_IN_PROGRESS
```

未发现阻塞 G4-D 的事务、CAS、API 或旧 DB 写入口问题。

## 2. 已复核范围

- `CandidateDecisionService` 只负责严格解析、HTTP 错误信封和窄命令分派。
- `CandidateLockRepository` 在同一事务内执行 exact replay、expected revision、FSM/no-op、目标与 G2 门禁、impact 重算、digest 比对、revision insert 和 Shot pointer CAS。
- exact replay 在 revision conflict 与 impact digest 重比对之前返回；no-op 不新增 revision、不更新 Shot、不取消任务。
- writer 唯一冲突、SQLite busy/locked 和 pointer CAS 失败只在重新读取后精确匹配原请求时重分类为 replay，否则统一为 revision conflict。
- commit 成功后才 best-effort 请求取消受影响活动任务；取消失败不回滚已经提交的定稿修订。
- favorite、reject/restore 与 current final 分离；当前定稿不可废弃，偏好变更不进入 lock set digest。
- complete 逐 active Shot 复核 G2 门禁、完整且 current 的 lock set；不会把 `layout_done/exported` 里程碑降级。
- Server 已删除旧公开 `POST .../candidates/{candidateId}/lock`，并移除旧 DB 直接写 revision/pointer 的实现；file-mode 兼容投影保留。

## 3. 事务不变量

1. revision 创建和 current pointer CAS 同事务；失败不会留下孤立 revision。
2. 同 expected revision 的两个不同 writer 只能一条成功，另一条返回 `CANDIDATE_LOCK_REVISION_CONFLICT`。
3. 丢响应后同 request 重试返回 `replayed`，revision 数量不增加。
4. preview 后 authority 影响集变化返回 `CANDIDATE_LOCK_IMPACT_CHANGED`，不发生写入。
5. replace/clear 不修改旧 Layout/Export/Asset 或其 current pointer；本阶段只请求取消受影响的活动任务。
6. API 错误不暴露 SQL、文件路径或凭据。

## 4. 验证证据

- Shared：54/54。
- Server 全量：520/525；5 个旧切换/备份用例仅在全量并行重负载下触发局部 5 秒 timeout，隔离复跑 5/5 通过。
- G4-C fresh SQLite + HTTP/事务定向：1/1，通过 created、no-op、sequential replay、revision conflict、impact changed、favorite/reject/restore、history、complete 和双 writer 一成功一冲突。
- Shared/Server typecheck、Shared/Server build、Prisma validate、`git diff --check` 全部退出 0。

## 5. 未覆盖边界

- G4-D 才把 lock set 与 Layout/Export source summary 纳入 Workbench/ProductionState，并关闭 stale/unresolved 下游门禁与迟到任务 current 提升。
- G4-E 才替换 Web 旧调用并实现影响确认、收藏/废弃/历史交互。
- G4-F 才完成 A→B→clear→A 全 API、replace-after-export、restart/backup restore 和总体用户路径复核。
