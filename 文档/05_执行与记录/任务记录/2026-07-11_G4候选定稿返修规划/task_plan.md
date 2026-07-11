---
doc_id: AIR-TASK-G4-PLAN-001
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent
source: ADR-0010、G1 Schema、G2 Freshness 契约与现有候选图链路
---

# G4 候选定稿返修规划

## 目标

在不重新设计七阶段框架的前提下，将候选图工作台从“改写 `lockedCandidateId` 和 Candidate.status”升级为可追溯的定稿修订链，并为 G5 画布返修提供稳定的来源和 freshness 契约。

## 范围

- `CandidateLockRevision` 的 `lock/replace/clear` 状态机、并发与幂等语义。
- 收藏、废弃/恢复与定稿的职责分离。
- 更换或取消定稿前的影响预览、`impactDigest` 和冲突处理。
- 当前 lock set digest、Layout 来源 freshness、Export 当前性与历史性。
- 候选图工作台的最小 UI 变更与上下游门禁。
- 旧 `lockedCandidateId/selected/locked` 数据的有证据迁移。

## 非目标

- 不在 G4 实现 G5 的高自由画布编辑器、格子换图交互或裁切返修。
- 不在 G4 实现 G6 的正式 PNG/PDF/ZIP 渲染与下载。
- 不改动 D2 的七阶段框架，不展开 D6/R5。
- 本次只完善开发文档，不修改代码、Schema 或工作区数据。

## 阶段

| 阶段 | 内容 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| G4-P0 | 读取事实源并建立任务记录 | completed | D3/G1/G2/G5 边界对齐 |
| G4-P1 | 审计现有候选、布局、导出和任务链路 | completed | 有文件级现状证据与缺口清单 |
| G4-P2 | 收口修订、影响预览和 freshness 契约 | completed | 状态机、事务、digest、错误码无歧义 |
| G4-P3 | 编写主方案、契约字典与验收清单 | completed | 开发可按子阶段执行 |
| G4-P4 | 同步上位文档、索引和记忆，完成静态复核 | completed | 无相互冲突、链接可达、状态为 proposed |

## 强制验收标准

1. A→B→clear→A 必须产生线性不可变修订，不能复用旧修订。
2. 丢失响应后的重试不得重复创建修订；真实并发冲突必须显式返回。
3. 影响预览和提交使用同一规范化计算，影响集变化时不得静默提交。
4. 更换定稿只新增修订和移动 Shot 当前指针；旧 Layout/Export/Asset 不被改写或删除。
5. 布局来源的 `current/stale/unresolved` 是派生值，不另建可写 stale 开关。
6. 上游不 current、候选来源不 current、候选已废弃/失效或 Asset 未 ready 时不能新建定稿。
7. G4 与 G5 边界清晰：G4 暴露来源、影响和门禁；G5 负责在画布上解决 stale。

## 交付物

- `文档/04_方案与决策/2026-07-11_G4候选定稿修订与返修开发方案.md`
- `文档/04_方案与决策/2026-07-11_G4候选定稿与影响预览契约字典.md`
- `文档/06_测试与验收/G4候选定稿返修验收清单.md`
- 本目录的 `task_plan.md/progress.md/findings.md`
- 本目录的 `handoff.md`
