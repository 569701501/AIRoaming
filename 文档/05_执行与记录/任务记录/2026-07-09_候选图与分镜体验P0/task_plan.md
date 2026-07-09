# 任务计划：候选图与分镜体验 P0

---
doc_id: AIR-TASK-2026-07-09-CANDIDATE-STORYBOARD-P0
status: active
created: 2026-07-09
owner: AI漫游项目
audience: human, ai-agent, developer
source: 竞品对照终版结论 + 候选图/分镜代码现状探索
---

## 1. 目标

让"出图"和"分镜"这两步的用户体验达到市面主流水准，具体回答：

- **候选图**：不满意时能清楚知道为什么、能高效重画、能看到历史。
- **分镜**：能预览每个镜头已锁定的画面、能拖拽调整顺序，减少"盲生候选图"。

## 2. 非目标（P0 不做）

- 单镜头 AI 重写（需新建后端 service + dialogue tool，工作量大，列为 P1）
- prompt 可编辑（P0 只做可见，编辑后置）
- 对白气泡 / 排版成稿 / PDF 导出（P1）
- 局部修图 inpaint（P2）
- 视频漫剧（P2）

## 3. P0 五项任务

| # | 任务 | 难度 | 依赖 | 阶段 |
| --- | --- | --- | --- | --- |
| A | 候选单格重画（明确语义=新批次，旧批保留） | 低 | 无 | 阶段1 |
| B | 候选版本历史/批次展示（5 态 UI 落地） | 中 | A | 阶段1 |
| C | prompt 可见（不可编辑） | 中 | 无 | 阶段1 |
| D | 分镜缩略预览（已锁定候选图回显） | 低 | 无 | 阶段2 |
| E | 分镜拖拽重排 + 批量重编号 | 中 | 无 | 阶段2 |
| F | 批量生成全章未锁镜头 | 低 | 无 | 阶段2 |

## 4. 关键约束（来自代码现状）

- 候选生成后端已是 push（追加），不会覆盖旧候选。
- 分镜改动会让候选图/排版失效（storyboard.service.ts L238-241），重排需提示用户。
- prompt 拼装在 store 私有函数 buildCandidatePositivePrompt，要可见需提升到组件可访问层。
- 分镜缩略预览数据全通：shot.lockedCandidateId → candidates → assetId → api.projectAssetFileUrl。
- 批量生成复用串行队列（runTaskSerialized 已就绪）。

## 5. 退出标准

1. 阶段1（候选）：单格重画语义明确、候选按批次分组展示、prompt 可见。
2. 阶段2（分镜）：镜头卡显示已锁缩略图、可拖拽重排、可批量重编号、可一键生成全章未锁镜头。
3. Scrutiny Review 静态复核通过。
4. Runtime/User Review 运行复核通过。
5. typecheck + test 全绿；文档同步完成记录。

## 6. 深思熟虑角色边界

- 本计划由 Orchestrator 角色产出，已基于代码现状和竞品调研。
- 阶段执行由 Worker 角色，逐阶段推进。
- 完成后 Scrutiny Review 只读复核，Runtime/User Review 由用户验证。
