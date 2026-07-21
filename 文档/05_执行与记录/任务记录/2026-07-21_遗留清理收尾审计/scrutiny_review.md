---
doc_id: AIR-TASK-20260721-CLEANUP-CLOSEOUT-SCRUTINY
status: passed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: Worker 完成后的只读静态复核
---

# Scrutiny Review

## 结论

`passed`。按四项判死标准，未发现尚可安全删除的明确死代码；保留项均有生产、动态装配、恢复/历史或有效测试责任。

## 复核项目

| 项目 | 结论 | 证据 |
| --- | --- | --- |
| 已删除符号是否残留 | 通过 | 全仓搜索仅剩测试对旧 `lockChapterCandidate` 不存在性的断言 |
| Web API 是否仍有零生产调用 | 通过 | API property 静态审计结果为空，typecheck/build 通过 |
| Nest/worker/CLI 动态入口是否误判 | 通过 | controller/module/provider、package script、worker 注册与 CLI 全部纳入调用图 |
| 仅测试调用项是否可删 | 通过 | overlay/ledger/registry/fixture 均为发布或恢复契约；`setHandler` 为测试注入，`toJSON` 为隐式协议 |
| 数据库是否被误收缩 | 通过 | Schema/migration 无变化；fresh deploy 53 表、242 trigger、17 migration |
| 新 G4 候选锁链是否受损 | 通过 | 仅退役旧 facade，正式 CandidateDecision 两阶段路径和 G4 集成测试通过 |
| 无关工作树是否被覆盖 | 通过 | 既有 OpenCode/Prompt 工作保留；其 E2E 不匹配只记录、不顺手改业务代码 |

## 非阻塞观察

- `purgeDeletedProject` 只有测试直接调用，但实现必要；真正问题是缺通用 Outbox 消费和最终 purge 调度。
- file fallback 仍形成可观体量，但 file E2E 仍真实可达；是否整体退役是架构选择，不是静态死代码判断。
- Web AppShell chunk 仍约 1.0 MB，属于拆包与 UI 性能债。
