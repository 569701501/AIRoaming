---
doc_id: AIR-D2-A2-1-PLAN-001
status: ready_for_execution
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-1 五份施工资料
---

# D2-A2-1 任务计划

## 目标

完成 Project/Chapter/Script 的首个非破坏性 DB 公开写闭环，并保持 file-mode bridge 可用、G2 CAS 真实、旧 workspace 不再是 DB 模式事实源。

## 阶段

| 阶段 | 负责人角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| P0 事实核对与拆分 | Orchestrator | completed | 已确认 A2-1/A2-2 边界与 schema 硬约束 |
| P1 施工资料 | Orchestrator | completed | Handoff/契约/测试/文件地图/复核清单齐全 |
| P2 DB command core | Worker | pending | metadata/ensure/pending/outline 定向测试通过 |
| P3 Service/API/cache | Worker | pending | 同进程公开 Service/API 一致、旧路由稳定拒绝 |
| P4 Web 双模式切换 | Worker | pending | file/db 分支、observed CAS、冲突提示通过 |
| P5 集成与门禁 | Worker | pending | fresh SQLite/restart/isolation/full regression 通过 |
| P6 静态复核 | Scrutiny Review | pending | `scrutiny_review.md` verdict=PASS |
| P7 运行复核 | Runtime/User Review | pending | `runtime_review.md` verdict=PASS |
| P8 完成记录与提交 | Orchestrator | pending | 完成记录、独立 commit、停止 |

## 关键决策

1. A2-1 不改 schema；任何需要新增 Chapter retirement 字段的需求退回 A2-2。
2. Web 使用 `VersioningCapability` 保持 file/db 双模式，不在 M6 前破坏 file-mode bridge。
3. AI 结果先进入 `ChapterScriptPending`，采用只进入 Working Copy，Publish 才产生 ScriptVersion。
4. Outline confirm 必须携带 expected outline ID，不能确认服务端“最新一份”。
5. 直接 versioning DB 写后必须刷新 ProjectRepository identity map。
6. A2-1 只更新 5 个 operation evidence，blockedIds 仍为 6。

## 强制停止条件

- 需要 schema/migration/trigger 变化。
- 需要物理删除历史或 milestone 回退。
- 需要真实根、真实 provider、真实凭据。
- 需要跨入 A2-2/A3/A6/final/M6。
- 无法同时满足 G2 CAS 与 file-mode 兼容。
