---
doc_id: AIR-G3-M5-PROGRESS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5 documentation readiness work
---

# 进展

- [x] 读取 G3-M 五份施工资料、M4 acceptance/handoff/evidence、G1 M1.6/M2/M3/M4、SecretStore 与验收第 9～14 节。
- [x] 探索当前 Settings、Prisma、ProjectRepository、Maintenance、migration CLI 与测试 fixture 代码。
- [x] 明确 M5 与 D2/M6 边界：允许临时 coordinated backup/restore；pre-cutover/final/activate 继续阻塞。
- [x] 拆分 M5-A0～A3，给出精确文件边界、CLI、数据结构、错误码和测试 ID。
- [x] 形成 Luna 第一张任务书。
- [x] 补齐 full-shadow 16 切片证据集校验，禁止用单个 succeeded run 冒充全量完成。
- [x] 完成文档交叉复核、JSON 解析、路径存在性和 `git diff --check`；无代码/Schema/migration 变更。
- [x] M5-A0 capability registry + CLI 实现：8 个稳定 ID、诚实三态状态、证据 ID 约束和 fail-closed check 已落地。
- [x] M5-A1 coordinated backup 实现已落地；happy path、ready Asset 缺失和 pre-cutover 阻断通过，完整 BAK-01～03 证据待 A4。
- [x] M5-A2 restore 实现已落地；verify-only、materialize、manifest 篡改/目标已存在通过，完整 RST-01～03 证据待 A4。
- [x] M5-A3 happy-path rehearsal：backup → verify-only → materialize → DB restart → Nest HTTP `/api/projects` read smoke 通过；不能替代未执行的故障矩阵。
- [ ] M5-A4 backup/restore 验收收口：一致性、ledger/release identity、secret/path/compensation 与完整 rehearsal。

# 当前结论

M5-A0 已通过；M5-A1～A3 的实现和 happy path 存在，但独立复核后 M5 为 `hardening_required`。下一入口是相邻 `2026-07-13_G3-M5A4验收收口/handoff.md`，M6 继续被 M5-A4、capability、SecretStore、final gate 和用户授权阻塞。
