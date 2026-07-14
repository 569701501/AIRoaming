---
doc_id: AIR-G4-B-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, reviewer
source: G4-B 实现、G4 契约字典、ADR-0010 与验收清单
---

# G4-B 静态复核

## 1. 结论

```text
phase = G4-B
result = passed
commit = 9cd599a
next = G4_C_IN_PROGRESS
```

未发现阻塞 G4-C 的纯规则、codec、freshness 或影响摘要问题。

## 2. 已复核范围

- 状态机：unset/finalized/cleared 的 legal、invalid 与 no-op 闭集；replay 只匹配 current.previous/action/target。
- Lock set：只统计 active Shot，retired 不阻塞；complete/incomplete/unresolved 与 source applicability 分轴；digest 排除 Candidate 展示字段。
- 严格 codec：拒绝 unknown field、非法 nullability、非规范排序、重复/交叉分类和伪 digest 形态。
- Working Copy：按 document kind 投影；legacy ID 固定为 `legacy:{pageId}:{order}`；unresolved 信封不猜 current。
- Freshness：binding、lock set digest、revision position 和 Export completion applicability 分轴派生。
- Impact：Working Copy、正式 Layout binding、Export 与 active Task 递归收敛；所有 authority ID 规范排序去重；展示计数不进入 digest。

## 3. 不变量

1. lock set known-answer 为 `sha256:4f6c37787190492a33a825fe0dd902cd1b1587cf8b8dc28f4dd81e08a5e9d8ff`。
2. 只改数据库行序、Storyboard order、Candidate label/favorite 不改变 lock set digest。
3. impact digest 精确包含 intent、expected revision 与五类 authority ID 集；数量、时间、文案、路径不参与。
4. no-op 和首次 lock 仍产生合法 digest，但 affected/active 数组为空。
5. unresolved 优先于 stale；historical position 不抹掉 sourceResolution 详情。
6. 旧 Layout/Export/Asset 没有被纯 resolver 修改；模块无数据库、文件、网络或 provider IO。

## 4. 验证证据

- Shared 定向：8/8。
- Server 定向：22/22。
- 完整回归：Shared 54/54；Server 519/524 首轮通过，5 项旧迁移/备份慢测仅在并行重负载下触发局部 5 秒 timeout，隔离串行复跑 10/10 通过。
- Shared/Server typecheck、Shared/Server build、`git diff --check` 全部退出 0。

## 5. 未覆盖边界

- G4-C 才接入一致读 preview、事务内 commit、CAS、lost-response replay、favorite/reject/complete API 与旧 lock API 删除。
- G4-D～F 才覆盖 Server 下游门禁、迟到任务、Web 交互、真实用户路径、restart/backup restore。
- 因此本复核不把纯规则通过表述为 G4 总体通过。
