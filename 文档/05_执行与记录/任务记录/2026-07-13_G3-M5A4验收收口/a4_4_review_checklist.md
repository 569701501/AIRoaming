---
doc_id: AIR-G3-M5-A4-4-REVIEW-001
status: ready_for_review
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-4 handoff、实施契约与测试矩阵
---

# M5-A4-4 复核清单

- [ ] materialize 后恢复 DB/workspace 再扫描，sentinel=0。
- [ ] 恢复 DB 启动应用并读取项目 API，maintenance closed。
- [ ] `PersistenceState` 仍为 `shadow/null/null`，firstBusinessWriteAt=null。
- [ ] A4-CLI-01、A4-BAK-01～04、A4-RST-01～05 全部有直接证据。
- [ ] server 全量、workspace/server typecheck、G1 三项、Prisma validate、diff check 全绿。
- [ ] Scrutiny Review 只读复核代码/契约/证据；Runtime/User Review 记录临时 fixture 运行结果。
- [ ] 未访问真实根/SecretStore，未执行 final/pre-cutover/activate，未进入 D2/M6。

结论模板：`passed_for_m5` / `failed`；若通过，M5 状态改为 `completed`，D2/M6 仍需独立授权。
