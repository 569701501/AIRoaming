---
doc_id: AIR-D2-A2-2-REVIEW-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A2-2 contract
---

# 复核清单

- [x] 7 个 legacy operation 每个都有 retired reason、replacement、稳定拒绝和现代成功证据。
- [x] DB rejection 前后无 workspace/DB 写；file mode 回归保持通过。
- [x] Working Copy clear 仅 observed CAS；ScriptVersion/current/下游历史不删除。
- [x] registry/project capability implemented，`blockedIds` 精确为 5，其他 capability 不变。
- [x] server 全量、typecheck、web build、Prisma/G1、diff check 全绿。
- [x] 已新增 `scrutiny_review.md`、`runtime_review.md`，并完成独立提交前复核。
