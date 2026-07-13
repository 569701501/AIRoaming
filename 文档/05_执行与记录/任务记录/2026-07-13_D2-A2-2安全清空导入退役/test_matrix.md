---
doc_id: AIR-D2-A2-2-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A2-2 contract
---

# 测试矩阵

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| A2-2-01 | Working Copy clear | observed CAS；formal history/current 不删除 |
| A2-2-02 | 旧 pending confirm/discard | 409 retired；现代 adopt/discard 成功 |
| A2-2-03 | clear dirs | DB 零文件副作用；file mode 回归 |
| A2-2-04 | import/reset | 409 retired；replacement 明确，不产生 DB/workspace 写 |
| A2-2-05 | registry | 7 retired 均有 reason/replacement/evidence |
| A2-2-06 | aggregate | project implemented，blockedIds=5，其他项不变 |
| A2-2-07 | restart/isolation | rejection 前后 DB、workspace、current pointer 字节/语义不变 |

门禁：server 全量、workspace typecheck、web build、Prisma validate、G1 三项、diff check。
