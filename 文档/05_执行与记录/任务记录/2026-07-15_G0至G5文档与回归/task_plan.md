---
doc_id: AIR-TASK-20260715-G0-G5-DOC-REGRESSION-PLAN
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户要求先检查并写好 G0～G5 文档进度，再从 G0 到 G5 顺序测试
---

# G0～G5 文档复核与顺序回归计划

## 1. 目标

1. 以现有代码、测试入口、阶段完成记录和验收证据复核 G0～G5 的真实进度。
2. 修正文档中与 `G0_G5_COMPLETE` 冲突的过期状态，明确已完成、延期和非本轮范围。
3. 按 G0、G1、G2、G3、G4、G5 顺序重新执行测试门禁，并记录可复核结果。

## 2. 非目标与禁止边界

- 不实现或测试 G6 素材包 V2、真实 ZIP、下载或 `PackageRevision`。
- 不实现或测试轻量视频、TTS、字幕、BGM 或 MP4。
- 不进入 G7 总验收。
- 不删除 backup/archive。
- 不执行 down migration，不回退 file-only。
- 不写日期排期或工期估算；按依赖顺序连续执行。

## 3. 阶段

| 阶段 | 角色 | 工作 | 退出标准 |
| --- | --- | --- | --- |
| P0 | Orchestrator | 读取事实源、测试入口、完成记录和工作区状态 | 范围与测试矩阵明确 |
| P1 | Worker | 逐份复核并修正文档进度 | G0～G5 状态一致，G6/视频明确延期 |
| P2 | Worker | 顺序执行 G0～G5 测试门禁 | 每阶段有命令、数量、结论和失败说明 |
| P3 | Scrutiny Review | 只读复核文档、测试证据和边界 | 给出通过/不通过与风险 |
| P4 | Runtime/User Review | 汇总真实浏览器/DB-only/渲染测试结果 | 给出运行复核结论 |
| P5 | Orchestrator | 更新完成记录、进度、会话与长期记忆 | 本轮留痕完整 |

## 4. 测试顺序

| 阶段 | 主要门禁 |
| --- | --- |
| G0 | E2E 环境契约、prepare、基础 file/DB Playwright 安全网 |
| G1 | Prisma validate、schema/manifest/migration gate、数据库持久化测试 |
| G2 | Shared 版本链/失效规则与 Server Repository/任务/Outbox 回归 |
| G3 | DB-only、迁移、file guard、备份恢复与漫画版式入口回归 |
| G4 | CandidateLockRevision、preview/commit/返修/历史/来源门禁与浏览器路径 |
| G5 | Layout kernel、Working Copy、编辑器、来源返修、render、migration 与 DB-only Playwright |

实际命令以仓库当前脚本和各阶段验收清单为准；不得为了制造通过结果跳过默认门禁。

## 5. 验收标准

- 事实源不再把已经完成的 G0～G5 写成待执行或部分完成。
- G6 素材包、G7 和轻量视频明确标为延期且不计入本轮未完成。
- G0～G5 测试按顺序执行，全部结果可在 `progress.md` 复核。
- 若出现失败，记录根因、影响范围和是否阻断，不静默忽略。
- Scrutiny Review 与 Runtime/User Review 均有结论。

## 6. 退出标准

只有文档复核、G0～G5 顺序测试、双 Review 和最终留痕全部完成，本任务才可标记 `completed`。

## 7. 完成结论

- 文档复核：完成。
- G0～G5 顺序回归：完成，结论为通过。
- Scrutiny Review：`passed_with_observations`。
- Runtime/User Review：`passed_automated_runtime`。
- G6 素材包、G7 与轻量视频继续延期，不计入本轮失败或未完成工作。
