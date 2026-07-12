---
doc_id: AIR-G3-M3-A0-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M施工包与迁移账本决策
---

# 目标

实现 G3-M3 的第一条可独立验收切片：迁移运行账本状态机、来源身份规则、sealed snapshot 的 comicFormat 审计。

# 非目标

- 不连接真实工作区数据库。
- 不创建或更新 `Project` 等业务表。
- 不实现 G3-M3 的完整实体导入顺序。

# 任务

- [x] 运行账本：running → blocked/succeeded/failed，终态不可变。
- [x] 问题记录：只允许挂在 running 运行，重复 issueKey 拒绝。
- [x] 来源记录：sourceKey 冲突阻断，provenance 单调升级，稳定 entityId。
- [x] 快照审计：验证 SEALED 与源文件 digest，扫描 project.json。
- [x] 报告与 CLI：确定性输出，显式输入路径。
- [x] 测试与全量校验。

# 退出标准

RUN-01/RUN-02/RUN-03、AUDIT-01..03 通过；typecheck、全量 server 测试、G1 三项检查通过；文档明确该切片不是完整导入。
