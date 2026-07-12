---
doc_id: AIR-G3M0-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M施工包与G3交接文档
---

# 目标

在提交基线 `0dbf93d` 上完成 G3-M0 maintenance gate，为后续 snapshot/importer/activation 提供明确的封口边界。

# 允许范围

- `apps/server/src/maintenance/**`
- 必要的 App/Projects/Dialogue/Tasks/ToolCallback/Settings 接线与写入口保护
- MNT-01..06 测试、package script、任务记录

# 禁止范围

- snapshot/importer/backup/restore/activate
- 真实 workspace 迁移与 G5
- 修改 G3 enum、Prisma migration 0010 或既有 G3 核心语义

# 阶段与退出标准

1. 维护状态机、mutation lease、五类 participant 可运行。
2. loopback + 显式 token file 管理入口可拒绝未授权请求。
3. closed runtime bundle skeleton 可稳定生成且不含 secret/token。
4. MNT-01..06、server typecheck、server 全量测试、G1 三项检查通过。
5. 形成 handoff、静态复核和运行复核记录。
