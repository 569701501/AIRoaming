---
doc_id: AIR-TASK-20260712-G3-READINESS-PLAN
status: complete
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求在交给 Luna 开发前审视 G3 文档
---

# 目标

复核 G3 资料是否已经达到“另一位开发者无需依赖聊天上下文即可独立施工、验证和交接”的标准。

# 非目标

- 不实现 G3 功能。
- 不修改 Shared、Web、Server、Prisma 或 workspace 业务代码。
- 不读取或改动真实 workspace、真实数据库和密钥。

# 验收标准

1. G3 产品、领域、API、DB、file 兼容、UI 和测试要求均可追踪到当前代码入口。
2. 标出所有会导致 Luna 自行猜测、返工或破坏旧数据的缺口。
3. 给出明确的“可直接施工 / 有条件施工 / 不建议施工”结论。
4. 形成 Luna 可执行的交接顺序与退出标准。

# 阶段

1. 读取事实源和既有 G3 规划记录。
2. 对照当前代码与迁移树建立追踪矩阵。
3. 检查跨层顺序、失败语义、兼容策略和验证命令。
4. 输出静态复核结论和交接说明。

# 退出标准

- `findings.md` 包含证据、问题等级和结论。
- `progress.md` 记录审查范围与完成状态。
- `scrutiny_review.md` 给出正式通过/不通过结论。
- `handoff.md` 能直接作为 Luna 开工前说明。

# 完成结论

- 审查已完成，正式结论为“不通过直接施工门禁”。
- 三份 G3 文档已达到产品与领域设计级，但尚未达到当前仓库上的独立施工级。
- 主要阻塞是 G1 importer/DB-only 前提不成立、file mode 旧项目策略未裁决，以及 `0010` 迁移与现有 ledger 门禁的接法未冻结。
