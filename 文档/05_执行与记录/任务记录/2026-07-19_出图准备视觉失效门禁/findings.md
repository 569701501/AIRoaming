---
doc_id: AIR-TASK-20260719-PREFLIGHT-VISUAL-FRESHNESS-FINDINGS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 真实页面、生产 DB 只读检查、SQLite 副本复现
---

# 发现

## 已证实根因

1. `SourceSnapshotBuilderService` 能基于当前 CharacterVisual/SceneVisual/Asset 重建正确 source digest。
2. `resolveChapterProductionState` 当前只把 Preflight snapshot 与当前 Storyboard 比较，没有拿 live 视觉来源重建结果比较。
3. `NewWorkGate.checkShotImage` 只读取上述错误的 `state.preflight.freshness`，因此错误放行。
4. `PersistentG2TaskCreateGuardService` 从旧 Preflight 文档冻结旧 `scene_visual`，最终由 DB source trigger 拒绝 missing Asset；Prisma P2003 未映射，页面显示 500。

## 事实时间线

- 12:27：确认旧 Preflight。
- 12:37：旧 scene Asset 因 ENOENT 从 ready 变 missing。
- 13:07：新 scene visual/Asset 生成成功并成为 current。
- 候选图创建：仍读取 12:27 快照，未生成 GenerationTask，未调用 Provider。

## 约束

- ADR-0013 已明确 Preflight 必须识别角色生成输入、场景视觉和画风变化。
- G2 验收 PF-05/PF-07/PF-12、WF-06 已明确视觉变化要 stale、新图片任务返回 409。
- ADR-0018 规定出图准备是纯门禁，缺项或来源变化不能在该页自动修复。

## 风险

- 若只在 Task Guard 临时重建 snapshot，workflow 页面仍会错误显示 done；必须让生产状态查询和任务门禁共用同一 live 比较结论。
- 若把所有项目角色变化都纳入摘要，会让未出镜角色误触发 stale；必须沿用当前 Storyboard 实际引用集合。
- 不能原地修改确认 Preflight 或 current 指针；重新确认必须新建 revision。

## 修复结论

1. production-state 不再只校验旧 Preflight 自身，而会在正式查询和 NewWorkGate 中重建 live source snapshot。
2. 已确认快照与 live 快照的差异按以下稳定 reason code 输出：
   - `PREFLIGHT_SOURCE_STORYBOARD_CHANGED`
   - `PREFLIGHT_CHARACTER_INPUT_CHANGED`
   - `PREFLIGHT_SCENE_INPUT_CHANGED`
   - `PREFLIGHT_STYLE_INPUT_CHANGED`
   - `PREFLIGHT_SOURCE_UNRESOLVED`
3. visual/Asset 变化只让 Preflight stale，不让 Story 或 Storyboard stale，不回退 milestone。
4. stale Preflight 下 `image_generate` 在创建 GenerationTask 前返回 409；数据库 P2003 不再是正常用户路径的第一层反馈。
5. 用户重新确认当前 preview 后会创建新的不可变 PreflightRevision，候选任务恢复可入队。

## 证据

- 失败前：shared 回归收到 `current`，DB 集成回归收到 `current`。
- 修复后：同一回归收到 `stale + PREFLIGHT_SCENE_INPUT_CHANGED`。
- 旧 Preflight 下任务数保持不变；新 Preflight 确认后只创建 queued 任务，测试不启动 worker。
- 真实页面显示第 4 步来源变化、第 5 步禁用，console 0 error。
