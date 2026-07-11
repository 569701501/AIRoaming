---
doc_id: AIR-TASK-20260711-G2-FRESHNESS-HANDOFF
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2 规划交接
---

# G2 上游版本与 Freshness 规划交接

## 已交付

- `文档/04_方案与决策/2026-07-11_G2上游版本链与Freshness开发方案.md`
- `文档/04_方案与决策/2026-07-11_G2版本来源与Freshness契约字典.md`
- `文档/04_方案与决策/ADR-0013_上游版本链与派生Freshness.md`
- `文档/06_测试与验收/G2上游版本链与失效验收清单.md`

## 当前状态

- 正式文档为 `accepted`，规划完成，功能尚未实现。
- G2 复用 G1 模型，以 Working Copy、不可变正式版本、current/pending 指针和派生 freshness 取代原地覆盖与清历史。

## 实施入口与复核

G1 DB-only 通过后按 G2 切片推进。Static/Scrutiny Review 已通过；Runtime/User Review 需在剧本/结构/分镜返修、迟到任务、重启和旧产物保留的真实路径中补证据。

