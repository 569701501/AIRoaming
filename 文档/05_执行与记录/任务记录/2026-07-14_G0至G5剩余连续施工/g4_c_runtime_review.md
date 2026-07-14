---
doc_id: AIR-G4-C-RUNTIME-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: fresh SQLite、真实 Nest HTTP 路由与事务竞争运行结果
---

# G4-C 运行复核

## 1. 结论

```text
phase = G4-C
result = passed_isolated
http_api = passed
sqlite_transaction = passed
user_ui = pending_G4-E_F
```

## 2. 已运行路径

1. fresh migration 后启动真实 Nest HTTP Server，经 `POST candidate-lock/preview` 和 `PUT candidate-lock` 完成首次定稿。
2. 对同一请求模拟丢响应重试，返回 `replayed` 且 revision 仍为一条。
3. 对相同 Candidate 执行 replace，返回 `no_op` 且 Shot/revision 不写。
4. 收藏、取消收藏、废弃、恢复普通 Candidate；尝试废弃 current final 返回稳定 409。
5. 两个 preview 观察同一 current，先提交一个，再提交另一个，后者返回 revision conflict。
6. preview 后新增引用 current lock revision 的活动任务，旧 digest commit 返回 impact changed 且不写 revision。
7. 同时提交两个不同 replace writer，结果严格一成功一 409，数据库只新增一条线性 revision。
8. HTTP history 分页按 revision 降序返回；完成章节使用完整 current lock set，之后现有 Layout/Export/package 路径继续通过。
9. DB 模式调用旧 `ProjectsService.lockChapterCandidate` 返回 `LEGACY_WRITE_ROUTE_DISABLED`。

## 3. 未执行

- 未运行浏览器页面、影响确认弹窗、双窗口 UI、截图或 trace；这些属于 G4-E/F。
- 未在真实目标 DB 写候选业务数据；本阶段只使用 fresh 临时 SQLite。
- 未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
