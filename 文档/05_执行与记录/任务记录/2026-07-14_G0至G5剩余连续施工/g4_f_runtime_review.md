---
doc_id: AIR-G4-F-RUNTIME-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 临时 DB-only 数据库、公开 HTTP API、真实 Chromium、loopback fake provider、备份恢复运行结果
---

# G4-F 暨 G4 总体运行复核

## 1. 结论

```text
phase = G4-F
result = passed
overall_g4 = G4_PASSED
browser_repeat = 3/3
restart_and_restore = passed
next = G5_M0_IN_PROGRESS
```

## 2. 已运行用户与系统路径

1. 通过公开 Script→Story→Storyboard→Preflight→image task 路径生成三张候选，收藏、废弃、恢复均不改变当前定稿。
2. 真实页面完成 A→B→clear→A，数据库形成 v1～v4 线性 revision；随后并发窗口又形成 v5/v6，历史面板完整显示六条不可变记录。
3. 已有 Layout/Export 后只生成一张新 Candidate，当前定稿仍为 A/v4，Layout/Export 来源保持 current，导出门仍开放。
4. 一个窗口持有旧 preview，另一个窗口先 replace；旧窗口提交得到 409，页面重新计算影响并明确提示“本页面没有自动提交”，再次确认后才创建新 revision。
5. replace 后排版页保留旧输出，显示候选来源已变化，PNG 导出入口禁用；clear 后 incomplete gate 同样 fail-closed。
6. 运行中任务、取消请求、迟到结果与 restart 由 P6/G4-D 集成路径验证；旧来源完成结果只可 historical，不能覆盖新 current。
7. legacy direct evidence 合法时恢复 v1；Candidate 缺失、Asset 未 ready 与既有 runtime current 冲突均阻塞且不写 revision/pointer。
8. DB-only 协调备份后在全新目录 materialize，重开恢复数据库，revision/current/digest 与两个 Asset 文件字节完全一致。

## 3. 可视证据

- `evidence/g4_f_conflict_repreview.png`：409 后重新展示影响，明确未自动提交。
- `evidence/g4_f_candidate_history.png`：v1～v6 线性历史可读。
- `evidence/g4_f_layout_stale.png`：旧排版保留、来源已变化、新导出被阻止。

## 4. 运行边界

- 所有 G4-F 自动化使用临时 SQLite、临时素材目录、loopback fake provider 与假密钥；未向真实目标数据库写入 G4 业务 fixture，未访问外网 provider。
- 未删除 backup/archive，未执行 down migration、file-only 回退、G6 或视频链路。
- G4 用户可见的“实际换图与裁切将在成稿编辑阶段处理”边界符合方案；下一阶段从 G5-M0 开始。
