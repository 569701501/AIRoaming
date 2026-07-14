---
doc_id: AIR-G4-D-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, reviewer
source: G4-D 实现、G4 来源契约、数据库门禁与 P6 集成证据
---

# G4-D 静态复核

## 1. 结论

```text
phase = G4-D
result = passed
commit = 894d1e8
next = G4_E_IN_PROGRESS
```

未发现阻塞 G4-E 的来源投影、工作流、任务适用性或下游写门禁问题。

## 2. 已复核范围

- `WorkbenchSnapshot` 与 `ChapterProductionState` 返回同一份 `candidateSources`：完整/current lock set、Working Copy、current Layout、current Export 及四个 Server gate。
- `CandidateSourceQueryService` 从 Shot current CandidateLockRevision、正式 binding、sealed digest 与 Export source 重算 current/stale/unresolved，不改写历史记录或 current pointer。
- sealed Layout binding digest 不一致优先映射 `LAYOUT_SOURCE_DIGEST_MISMATCH`；普通旧 lock binding 映射 `LAYOUT_SOURCE_STALE`；断链映射 `LAYOUT_SOURCE_UNRESOLVED`。
- `buildChapterLayout`、正式 LayoutRevision 创建、layout publication 和 asset package 在写入事务内再次检查来源，避免“检查通过后来源改变”竞态落正式 current 记录。
- DB-only 旧 Working Copy stale 时不自动重绑新定稿；G4 只阻断，实际替换留给 G5。
- 运行中下游任务进入 replace impact，commit 后请求取消；completion-time fence 重新比较 sealed task sources，只能得到 `historical`，不能提升 current。
- 新 `image_generate` 只新增 Candidate/Asset，不改变 Shot current revision、lock set digest 或既有 Layout/Export freshness。
- preview 使用只读事务边界，不会误消费 `firstBusinessWriteAt`；Candidate DB 写 owner 登记已从退役的 ImageCandidate writer 同步到 CandidateLockRepository。

## 3. 不变量

1. replace/clear 不清空或改写旧 Layout/Export/Asset/current pointer，只让查询派生 stale/unresolved。
2. stale/unresolved/digest mismatch 在 Server 写入口 fail-closed，不能只依赖 Web disabled。
3. gate 检查和正式 DB revision/current pointer 写处于同一业务事务；竞争顺序只能得到“旧写先完成后被标 stale”或“新来源先提交、旧写被 409 阻断”。
4. 完整 lock set digest 仍只由规范排序的 Shot/revision ID 组成；布局 source digest 不再混入 Asset ID/sha。
5. restart 后所有来源状态由 DB 重新推导，结果与重启前一致。

## 4. 验证证据

- G4-D gate/只读事务/写边界/P6 定向：16/16，通过。
- G4-B 相关纯规则回归：22/22；Shared 全量：54/54。
- Server 全量检查点：510/525；14 项为旧备份/迁移/CLI 用例在并行重负载下超过局部 5 秒，1 项为 G4-C 后写 owner 清单未同步。清单已修复并隔离 3/3；三个旧文件隔离复跑 40/40、4/4、12/12。
- Shared/Server build、Server/Web typecheck、Prisma validate、G1 schema check、`git diff --check` 全部退出 0。

## 5. 未覆盖边界

- G4-E 才接入 Web 收藏、定稿、更换、clear、废弃/恢复、历史、preview 影响确认与 stale 摘要。
- G4-F 仍需完整 A→B→clear→A API、迁移冲突/unresolved、双窗口、实际浏览器路径和 backup restore 总体复核。
- G5 才实现 stale Working Copy 的实际换图/重绑、编辑命令和新 LayoutRevision；G4-D 不提前修改画布。
