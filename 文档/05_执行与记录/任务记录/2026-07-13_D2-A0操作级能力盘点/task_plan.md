---
doc_id: AIR-D2-A0-PLAN-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2 路线与 A0 handoff
---

# D2-A0 任务计划

## 目标

建立可执行、可测试、不会被聚合绿灯掩盖的操作级 DB capability 盘点，为 D2-A1 提供唯一入口。

## 阶段

| 阶段 | 状态 | 退出条件 |
| --- | --- | --- |
| 代码探索 | completed | 找到 8 个聚合项和 36 个门禁调用点 |
| 施工资料 | completed | 五份资料已写，边界和验收命令明确 |
| registry/spec 实现 | completed | 操作登记、源码覆盖测试、CLI 输出完成 |
| 静态复核 | completed | checklist 全部通过 |
| 运行验证与提交 | completed | targeted/typecheck/CLI/diff check 通过并独立提交 |

## 退出门

- 不实现 D2-A1 或任何后续 capability。
- 不改变真实 workspace、数据库和系统 secret。
- 操作清单缺任何一个调用点即失败，不允许带病交给 Luna。
