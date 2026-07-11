---
doc_id: AIR-TASK-20260711-G1-DB-CUTOVER-PLAN
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, dba, qa
source: ADR-0012、D7全量数据库化迁移与切换方案、G0测试骨架方案、现有代码与真实workspace审计
---

# G1 D7 数据库事实源与切换开发规划

## 目标

1. 将 ADR-0012 的 D71–D76 决策展开为可逐阶段实施、验证和回退的 G1 开发级文档。
2. 明确 M0–M6 的 Prisma schema、关系核心/版本 Json/current 指针、Asset、SecretStore、GenerationTask/TaskAttempt、导入 provenance 和 DB-only 切换边界。
3. 明确影子导入、停写窗口、双重校验、一次切换、回滚点、旧文件封存和禁止 fallback 的操作顺序。
4. 为 G0 `migration_witness` 建立 G1 等价 DB 测试接替清单。
5. 本轮只写文档，不修改 Prisma schema、migration、业务代码、依赖、数据库或真实 workspace。

## 非目标

- 不实现数据库迁移或创建真实 `dev.db`。
- 不在本任务改变 D71–D76 已确认选择。
- 不把 D1、G2 freshness、D3、D4/D5、素材包 V2 的完整业务字段提前实现；只为其保留必要稳定关系和扩展点。
- 不引入 PostgreSQL、Redis、BullMQ、多进程 worker 或云端 Secret Manager。
- 不允许 JSON/Markdown 与 SQLite 在切换后继续作为双主源。
- 不使用真实图片 key 作为迁移样例或测试数据。

## 强制退出标准

1. 每个表、Json 字段、current 指针、唯一约束、索引、状态枚举和删除策略都有明确归属。
2. 每个旧文件/内存状态都映射到“导入、派生重建、只读封存、报告异常或明确丢弃”之一。
3. M0–M6 每阶段均有输入、输出、允许写入、禁止写入、验证命令、失败处理和退出闸门。
4. 停写切换与回滚时点清晰，任何失败不会让 DB 和旧文件同时成为可写事实源。
5. SecretStore 明确文本 key/图片 key 分治，任何数据库、普通文件、日志、任务和 artifact 示例不含明文。
6. 持久任务具备 at-least-once、lease、heartbeat、attempt、幂等、来源适用性、协作取消和启动恢复契约。
7. G0 测试接替、导入审计、DB-only 冒烟和真实数据演练均有可执行清单。
8. Scrutiny Review 通过；Runtime/User Review 作为未来实施阶段清单，不在文档任务中写成已通过。

## 阶段

### 阶段 1：事实复核

- [x] 读取事实源、ADR-0012、D7 方案、G0 方案与架构契约
- [x] 核对 Prisma schema、package scripts、Repository/Store、TasksService、SettingsService、workspace 路径和现有测试
- [x] 核对旧数据规模、task provenance、素材关系和缺失证据
- **退出标准：** 文档不依赖过期的模型、字段或数据规模假设。

### 阶段 2：目标 schema 与模块边界

- [x] 关系核心、版本 Json、current 指针与投影
- [x] Asset/文件 staged-ready、SecretStore、持久任务与 attempt
- [x] migration provenance、异常报告和只读旧任务
- **退出标准：** schema 可以支撑 G1，并为 G2–G6 留稳定关系但不提前实现完整功能。

### 阶段 3：导入、切换与回滚

- [x] 预扫描、影子库、重复导入、最终 snapshot 与校验（不采用运行期增量双写）
- [x] 同进程停写、runtime bundle、DB-only gate、metadata 独立封存
- [x] 切换前回滚、切换后恢复、firstBusinessWriteAt 边界和禁止静默 fallback
- **退出标准：** 操作手册能由开发者按步骤执行并在每个闸门停下。

### 阶段 4：测试与验收

- [x] G0 migration witness 的 DB 等价接替
- [x] schema/Repository/worker/SecretStore/导入/切换自动化矩阵
- [x] 真实 workspace dry-run 和 Runtime/User Review 清单
- **退出标准：** 没有只靠“migration 命令成功”判定切换完成。

### 阶段 5：正式文档与复核

- [x] 编写 G1 主方案
- [x] 编写 schema/旧数据映射与迁移执行验收清单
- [x] 同步上位文档、索引、会话和长期记忆
- [x] Scrutiny Review
- **退出标准：** 整套开发文档完善且用户授权前不进入实现。

### 后续门槛（不属于本任务完成条件）

- G1 三份文档已获用户确认并为 `accepted`；这只冻结开发基线，未来实施完成必须另写运行证据和完成记录，不能用文档状态冒充实现状态。
- 未获得用户明确开发授权前，不修改 Prisma schema、migration、业务代码、数据库或真实 workspace。
- 用户继续文档规划时，进入 G2“上游版本与 freshness”开发级文档；不越过 G2–G6 直接实施 G1。

## 当前深思熟虑角色边界

- **Orchestrator：** 读取事实源、拆 M0–M6、维护决策一致性。
- **Worker：** 本轮只写 schema/迁移/验收文档，不写代码和 migration。
- **Scrutiny Review：** 核对数据完整性、切换原子性、任务协议、秘密边界和回滚可行性。
- **Runtime/User Review：** 未来实施时验证 dry-run、停写提示、项目打开、任务恢复和真实素材；本轮仅给清单。

## Handoff

### 已完成

- 用户确认继续下一份 G1 文档。
- 明确本轮仍为文档阶段，不进入开发。
- 已完成事实复核、44 模型目标 schema、旧数据映射、M0–M6 runbook、验收矩阵、上位文档同步和静态复核。
- Scrutiny Review 通过；Runtime/User Review 因本轮只有文档变更而不适用，已保留为未来实施期强制清单。
- G1 文档任务完成；实现未开始，下一步等待用户决定是否继续 G2 文档。

## Result

- 新增并确认 G1 主开发方案、Schema/旧数据映射、迁移执行与验收清单三份 accepted 文档；实现未开始。
- 已把数据库事实源、运行态快照、秘密迁移、持久任务、Asset/Outbox、封存、切换和回滚边界展开到可实施粒度。
- 已完成 Markdown 路径、代码围栏、状态、索引和上位事实源一致性检查；未发现缺失的本地文档链接。
- 未修改 Prisma schema、migration、依赖、业务代码、数据库、设置文件或真实项目 workspace。
