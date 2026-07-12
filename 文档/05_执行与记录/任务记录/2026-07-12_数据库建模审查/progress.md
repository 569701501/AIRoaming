---
doc_id: AIR-TASK-DB-MODEL-REVIEW-002
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: 数据库建模审查进度
---

# 2026-07-12

- 阶段：事实源与 Schema 核对中。
- 边界：仅读审查，不修改实现。
- 已读：项目文档总入口、AI 上下文入口、写作与留痕规则、长期记忆。
- 下一步：对照 schema.prisma、0001–0010 migration、trigger DSL 与 schema 生成入口。
- 已完成：核对 44 模型分组、Story/Storyboard/Preflight 权威 Json 与投影关系、194 trigger 物理构成、51 个 scope pair 命名、3 个跨表 materialize 触发器。
- 已完成：追溯 Markdown/DSL → manifest → Prisma Schema/migration 生成链，确认普通 runtime 不依赖生成 CLI，迁移校验会读 manifest。
- 验证：`g1:manifest:check` 在当前工作区失败，错误 `G1_SCHEMA_MANIFEST_STALE`；原因是 manifest source closure 纳入了已新增 `db:verify` script 的 `apps/server/package.json`。Schema/migration check 因首项 fail-fast 未继续。
- 结论：设计意图可理解，但当前 trigger 和生成闭包过重；详见 `findings.md` 与会话记录。
- Handoff：本轮只读讨论，未修改代码/Schema/migration；如进入改造，先单独决定约束分层和投影去留。
- 用户新增目标：在代码已经完成较多的前提下，寻找不影响现有进度、不过度耗时的优化方式。
- 补充核对：0009/0010 已采用小型 overlay contract；G1/G2/G3 runtime ledger 会精确拒绝额外迁移。未来 0011+ 必须同步 ledger/catalog。
- 补充核对：Task claim/heartbeat/finish 的 Repository 流程依赖 3 个 materialize trigger 完成 Attempt/Slot/终态物化，属于高风险后置项。
- 建议顺序：先收窄 manifest source closure 并冻结旧生成基座；当前 DB-only/importer 里程碑继续使用现有表与 trigger；里程碑后再按每批 5–10 个低风险 guard 做 overlay 迁移和回归。
- 用户复核后提出四项盲点和生成器终局问题；本轮继续只读检查，没有修改业务代码、Schema 或 migration。
- 确认 importer slice 不直接依赖 G1 生成器，但 `db:verify` 直接读取 G1 manifest，并把只描述 G1、受 supporting source 影响的 digest 当作 effective Schema identity；这与 0009/0010 已生效的事实不一致。
- 修正第一阶段：先 ADR 决策，再建立 migration-ledger-based release schema identity、收窄 package closure、把 Prisma 版本锁改为独立检查；时间预算从“半天”调整为约 1 个工作日，单做 closure 才是 2～4 小时。
- 生成器终局：采用渐进退役。当前保留为历史复现工具；0011+ 不再扩展；DB-only + backup/restore + 一个稳定周期后删除活跃 generator/write CLI，仅保留 immutable artifacts、checksums 与必要特征测试。
- DELETE 验收：未来任何 scope→复合 FK 替代必须跑真实 SQLite parent DELETE/SET NULL/CASCADE/RESTRICT/部分 NULL/rollback/foreign_key_check 矩阵。
- 投影审计触发点：全量 shadow importer 两轮稳定通过后、final cutover 前必须完成读取点审计；`StorySceneProjection` 与 formalize guard、importer provenance 作为一个整体评估。
