---
doc_id: AIR-G4-D-RUNTIME-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: fresh SQLite、真实 Nest 服务、下游写门禁、任务与重启运行结果
---

# G4-D 运行复核

## 1. 结论

```text
phase = G4-D
result = passed_isolated
db_workflow = passed
downstream_gate = passed
late_task_fence = passed
restart = passed
browser_ui = pending_G4-E_F
```

## 2. 已运行路径

1. fresh SQLite 完成 Script→Story→Storyboard→Preflight→Candidate 定稿→images_done→Layout Working Copy→LayoutRevision→layout publication→asset package。
2. Workbench 与 ProductionState 均返回 complete/current lock set、current Working Copy/Layout/Export 和四个 allowed gate。
3. 创建引用 current lock set、CandidateLockRevision 和 LayoutRevision 的运行中 layout task；replace preview 列出 task、current Layout 与 current Export 影响。
4. 提交 replace 后任务收到 `cancelRequestedAt`，completion-time source fence 返回 `historical`，任务以 cancelled/historical 终止，current Layout/Export pointer 不变。
5. replace 后 Working Copy/current Layout/current Export 分别派生 stale；workflow 回到 `layout_export`，候选步骤保持 done，排版步骤为 needs_update。
6. stale 状态下调用 build layout、export layout、export package 均返回 409 `LAYOUT_SOURCE_STALE`；revision、artifact、current pointer、里程碑和已存在 package manifest 均未改变。
7. 已导出章节继续生成一个新 Candidate；Candidate 数增加，但 Shot current revision、lock set digest 与 stale 下游状态不变。
8. 关闭并重建 Nest context 后，ProductionState、Workbench source summary 与 workflow current step 和重启前完全一致。

## 3. 未执行

- 未运行浏览器交互、截图、trace 或双窗口；属于 G4-E/F。
- 未在真实目标数据库制造新的候选返修业务数据；运行复核使用 fresh 临时 SQLite。
- 未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
