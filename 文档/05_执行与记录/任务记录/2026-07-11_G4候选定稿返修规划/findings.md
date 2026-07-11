---
doc_id: AIR-TASK-G4-FINDINGS-001
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent
source: G4 代码库与文档探索
---

# 事实发现

## 已确认边界

- ADR-0010 已采纳：定稿使用不可变 `CandidateLockRevision`，更换/取消前做影响预览，旧布局、导出和任务结果保留。
- G1 目标 Schema 已包含 `CandidateLockRevision`、`Shot.currentCandidateLockRevisionId`、`LayoutWorkingCopy`、`LayoutRevision`、`LayoutSourceBinding`、`ExportRevision`和 `GenerationTaskSource`。
- `Chapter` 已有 `currentLayoutRevisionId/currentExportRevisionId`；G4 不新增平行的“当前布局/导出”事实源。
- G2 规定 `milestoneStatus` 单调不回退，返修通过 freshness/attention 表达；Candidate lock 变更不污染 Storyboard document digest。
- G5 负责 LayoutDocument 和解决画布 stale 的交互；G4 只建立修订、来源绑定、影响分析和门禁。

## 当前代码现状

- Shared 合同仍把 `selected/locked` 放在 `CandidateStatus`，`StoryboardShot/WorkbenchShot` 仍保存 `lockedCandidateId`。
- Server 当前的 lock API 是 `POST .../candidates/:candidateId/lock`，会原地改 Candidate.status 和 Storyboard shot 的 `lockedCandidateId`，没有修订链、影响预览或乐观冲突检查。
- Web 工作台以 Candidate.status 判断“已锁定”，没有收藏、废弃、clear、修订历史和影响对话框。
- 当前 LayoutExportService 从 `lockedCandidateId` 构建一镜一页并覆盖布局状态，没有 LayoutRevision、SourceBinding、lock set digest 或 stale gate。
- 当前 AssetPackageService 根据 `Candidate.status=locked` 收集素材，不绑定 ExportRevision/source digest。
- 当前生成与工作流门禁主要依赖 `Chapter.status`，已进入布局后无法再生成新候选，与返修需求冲突。

## 待在契约中收口

- 修订状态机、丢响应重放与真实并发冲突。
- `impactDigest` 的规范化输入、工作副本/正式布局/导出/活动任务的影响口径。
- 完整 lock set 的定义、digest 可产生条件与 `current/stale/unresolved` 优先级。
- Export 的“完成时 applicability”与“当前查询 freshness”分离，避免更换定稿后批量改写旧 ExportRevision。
- G4 候选页与 G5 画布修复的垂直切片边界。

## 最终结论

- 修订链使用当前 revision + 1 和唯一 previous，runtime 插入时 previous 必须是 Shot 插入前 current，不允许 detached branch。
- 不新增幂等表；只有 current.previous/action/candidate 与原请求精确匹配才返回 replayed，任何后续决策都打断该重放判定。
- preview 在一致读事务中计算，commit 在写事务中重算；影响策略固定 `candidate_lock_impact_v1`。
- Working Copy 通过 codec 临时投影 binding，正式 LayoutRevision 使用 G1 `LayoutSourceBinding`，不增新领域模型。
- lock set 结构状态与来源 applicability 分轴；新正式 layout 要求 `complete + current`。
- Export 完成时的不可变结论命名为 `completionApplicability`，现在是否 stale 由 current pointer + source resolution 派生。
- G4 不实现画布换图命令；只提供 stale/unresolved 投影和 Server 导出门禁，交给 G5 解决。
