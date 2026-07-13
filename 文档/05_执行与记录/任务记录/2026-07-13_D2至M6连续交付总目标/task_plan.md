---
doc_id: AIR-D2-M6-MASTER-PLAN-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: 用户要求将全部剩余工作整理为 Luna 连续目标
---

# D2 至 M6 连续交付总任务计划

## 1. 本轮文档任务

目标：把 M5 后全部剩余开发整理成 Luna 可连续执行的单一总目标；保留内部阶段门禁，但取消用户逐阶段确认。

## 2. 文档编制阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| DOC-1 | 核实 M5、D2、capability、final/M6 当前事实 | completed |
| DOC-2 | 盘点 D2-A2～A8、M6 C0～C7、真实授权边界 | completed |
| DOC-3 | 编写总 Handoff、目标、剩余工作、契约、测试、文件地图、续跑协议 | completed |
| DOC-4 | 同步现行路线与旧 Luna 入口，消除“每步等待”冲突 | completed |
| DOC-5 | 静态路径/术语/状态/差异复核，更新记忆并提交 | completed |

## 3. Luna 后续执行阶段

Luna 以 `execution_status.md` 为运行状态，按 P0～P12 顺序自动推进。详细范围见 `remaining_work.md`，阶段门见 `test_matrix.md`。

## 4. 退出标准

- 总资料没有把 M5 误写为未完成。
- 当前 blocker 精确为 4，Character delete→Outbox 的依赖与下降路线可验证。
- 所有剩余能力、final importer、M6 tooling、真实切换均有明确归属。
- Luna 无需用户逐阶段确认。
- 真实根、真实凭据、真实停写、archive、activate 仍需最后一次明确授权。
- 现行 active 文档不再与总 Handoff 冲突。
- 静态复核通过并独立提交。
