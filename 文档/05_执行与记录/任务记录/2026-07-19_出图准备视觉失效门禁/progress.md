---
doc_id: AIR-TASK-20260719-PREFLIGHT-VISUAL-FRESHNESS-PROGRESS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 进度

## 2026-07-19 P0 Orchestrator

- 已用生产 SQLite 一致性副本复现：`image_generate` 在 `GenerationTaskSource.create` 返回 Prisma P2003，未创建任务、未调用 Provider。
- 已确认旧 Preflight 快照引用 missing 场景 Asset；新 SceneVisual 已 ready，但 production-state 仍把 Preflight 判为 current。
- 已读取产品流程、任务协议、素材契约、ADR-0013、ADR-0018 和 G2 失效验收事实源。
- 下一步：在 DB 集成测试中先锁定 PF-05/PF-07/PF-12 与 WF-06。

## Handoff

当前进入 P1 Worker；禁止触发真实图片任务，只使用 fresh SQLite、临时 workspace 和不启动 worker 的任务创建断言。

## 2026-07-19 P1 Worker：失败回归

- 新增 shared 纯函数回归，旧实现把场景视觉变化错误判为 `preflight=current`，测试稳定跑红。
- 新增 fresh SQLite 集成回归，复现“旧场景 Asset missing、新 SceneVisual ready、旧 Preflight 仍 current”的真实故障。
- 回归同时冻结：第 4 步 `needs_update`、第 5 步不可启动、任务创建受控 409、任务表不新增、重新确认后允许入队。

## 2026-07-19 P2 Worker：根修

- `ChapterProductionQueryService` 在存在正式 Preflight 且 Storyboard current 时，使用 `SourceSnapshotBuilderService` 实时重建当前视觉来源。
- shared production-state 对已确认快照与 live 快照按 Storyboard、出镜角色、引用场景、画风四类分别比较。
- `NewWorkGateService` 在同一事务 reader 内复用上述生产状态，杜绝页面与任务门禁结论分叉。
- `ScriptVersionRepository` 仅增加可选 live snapshot 输入；未提供 live reader 的历史 mutation DTO 保持兼容。

## 2026-07-19 P3 Worker：页面投影核对

- 现有 DB workflow 已直接以 `image_preflight.status` 控制候选图页面，无需新增前端字段或第二套状态。
- stale 时第 4 步为 `needs_update`，第 5 步 `canStartTask=false`；候选图页面显示“请先通过出图准备”。

## 2026-07-19 P4 Scrutiny Review

- 只读复核通过：事实源仍是不可变 PreflightRevision；修复只改变派生 freshness 和新工作门禁。
- Story/Storyboard 在纯视觉变化下保持 current；角色、场景、画风 reason code 可区分。
- 无 Schema、migration、Provider、Asset 写入路径变化；DB trigger 仍保留为最后安全网。
- 残留风险：部分仓储 mutation 响应没有 live reader，可能短暂返回旧 productionState；正式页面查询和所有新图片任务门禁均走 live 路径，不影响本次用户路径。

## 2026-07-19 P5 Runtime/User Review

- Shared 全量：27 files / 167 tests 通过。
- Server 全量：129 files / 770 tests 通过；其中 DB 集成 42/42 通过。
- Shared/Server/Web 类型检查通过，`git diff --check` 通过。
- 真实项目浏览器无付费复核：候选图工作台显示“请先通过出图准备”，第 5 步禁用；进入第 4 步显示“来源已变化 / 来源 stale / 门禁 source_updated”，检查项全部就绪并提供“确认出图准备”。
- 未点击确认、未创建 `image_generate`、未调用图片 Provider；浏览器 console error 为 0。

## 最终 Handoff

用户当前真实页面已停留在“出图准备”。用户可自行点击“确认出图准备”，确认后再进入候选图工作台；本次修复不会替用户创建任何付费图片任务。
