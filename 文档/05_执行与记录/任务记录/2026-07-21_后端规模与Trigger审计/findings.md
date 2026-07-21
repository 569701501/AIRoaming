---
doc_id: AIR-TASK-20260721-BACKEND-AUDIT-FINDINGS
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent
source: 代码、迁移 SQL、标准运行 SQLite 与项目事实源
---

# 探索发现

## 一、结论摘要

- SQLite 全量迁移已经完成；标准库处于 `db_only`，问题不是“还没迁完”，而是迁移脚手架、生成器和文件态兼容路径没有同步退场。
- “53 张表”是当前真实业务表数量；“194 个 trigger”是 0008/G1 历史基线，当前标准库实际有 242 个。
- “后端 8.9 万行”是原始目录总量，包含大量测试和离线工具。按正常服务入口的静态依赖图估算，活跃生产后端约 3.83 万行，仍比前端重，但不是 8.9 万对 2.3 万的 3.9 倍关系。
- Trigger 体系当前没有失效或损坏，契约测试全部通过；真正问题是数量、审阅成本和部分重复防御。不能一键清空，应先缩模型，再逐批迁移约束。

## 二、代码规模复算

| 范围 | 文件数 | 物理行数 | 说明 |
| --- | ---: | ---: | --- |
| `apps/server/src` 全部 TypeScript | 383 | 89,426 | 包含生产、测试、迁移、生成和 CLI |
| 服务端测试 `*.spec.ts` | 136 | 26,514 | 占服务端总量 29.6% |
| 从 `main.ts` 静态可达的生产代码 | 145 | 38,328 | 正常 Nest 服务路径的近似口径，占 42.9% |
| 未从 `main.ts` 静态可达的生产代码 | 102 | 24,584 | 迁移、生成器、备份、检查 CLI 等，占 27.5% |
| `apps/web/src` TypeScript/Vue | 44 | 23,147 | 无同目录单元测试；另有 Web E2E 12 文件、1,666 行 |
| `packages/shared/src` | 67 | 14,391 | 前后端共同契约，未计入上述任一侧 |

静态可达分析不能替代运行采样，但足以说明 89,426 行并非都随正常服务入口承担业务请求。服务端生产代码中，`migration` 约 9,942 行、`persistence` 离线部分约 9,733 行、`backup` 约 1,192 行，是最大的一组非正常启动代码。

## 三、SQLite 与表数量

- 标准数据库：`/Users/liyadong/.airoaming/data/db/airoaming.sqlite`。
- `PersistenceState` 为 `db_only`，记录了 cutover、激活和首次业务写入。
- 17 个 migration 全部成功；`PRAGMA integrity_check` 为 `ok`，`PRAGMA foreign_key_check` 无违规。
- Prisma 当前有 53 个 model；运行库有 54 张表，其中一张是 `_prisma_migrations`，因此业务表正好 53 张。
- 53 张业务表共 873 行；35 张非空，18 张为空，标准库有 4 个项目。数据库文件约 3.3 MB。
- 0017 新增 9 张剧本双路径来源/导入状态表和 20 个 trigger；这 9 张表当前全部为空。空表不等于永远无用，但在继续建设前应先用真实用户路径证明其必要性。

53 张表可粗分为：迁移/控制 4、项目剧本与双路径导入 15、剧情结构/分镜/出图准备 10、角色/资产/候选 5、设置与 Provider 3、对话 6、持久任务 4、排版/导出/Outbox 6。

## 四、G1 Schema 生成器现状

- 生成器生产代码 16 个文件、9,142 行；测试 8 个文件、3,218 行；合计 12,360 行。
- 另有 28,950 行生成 manifest、1,390 行 `schema.prisma` 和 2,001 行 0008 migration SQL。生成产物大不等于运行时代码大，但会显著增加仓库认知和维护成本。
- 生成器只由六个 `g1:*` package script 调用；未发现正常 Nest 运行时导入。
- 发布 Schema identity 已只绑定 SQLite engine、`schema.prisma` checksum 和有序 migration checksums，不再绑定 G1 DSL/source digest。
- 当前构建配置仍广泛包含 `src/**/*.ts`，所以离线生成器和 CLI 虽不被服务加载，仍会进入服务端构建产物。
- ADR-0015 已决定渐进退役：全量 shadow、final import、DB-only、备份恢复和稳定发布周期满足后，保留不可变 manifest/schema/migration/checksum/必要 SQLite 测试，删除活跃 DSL、全量重建与 write CLI。
- 当前多数技术条件已满足，尚需显式确认“一个稳定发布周期”是否完成。结论不是重写生成器，而是冻结并进入独立退役任务。

## 五、Trigger 真实组成

当前 242 个 trigger 的事件分布：

| 事件 | 数量 |
| --- | ---: |
| `BEFORE INSERT` | 74 |
| `BEFORE UPDATE` | 126 |
| `BEFORE DELETE` | 39 |
| `AFTER UPDATE` | 3 |

历史演进：G1/0008 基线 194；后续 G2、G3、G4、G5 和 0017 新增或替换一部分，当前净值为 242。因此继续引用“194 个”会低估现状。

按 SQL 行为检查，239 个只通过 `RAISE` 拒绝非法写；只有以下 3 个同时执行跨表写入：

1. `trg_generation_tasks_claim_materialize`
2. `trg_generation_tasks_heartbeat_materialize`
3. `trg_task_attempts_finish_materialize`

这三个被持久任务仓储的 claim、heartbeat、finish 状态机直接依赖，负责创建 Attempt、同步 Slot、释放租约并物化终态/重试状态，是最后才能处理的高风险 trigger。

其余 trigger 的主要类别有重叠，不能简单相加：scope/owner 51、immutable 44、append/history/no-delete 12、transition/monotonic 15、purge 10、formal/projection 26、task/outbox claim/lease/fence 34、shape 7。它们主要是数据库最后一道一致性防线，并不是 242 段各自独立的业务自动化。

## 六、后端为什么变大

1. G1 一次性把最小数据模型从约 17 个主概念扩成 44 个 model/194 个 trigger，随后增至 53/242；历史复盘也已确认这是一次“大爆炸式建模”。
2. 为证明 Schema 一致性自建了约 1.24 万行生成器和大量契约测试；它完成了迁移使命，但尚未退役。
3. DB-only 已启用，主运行链仍保留 DB/file 双实现和旧 workspace 路径分支。`ProjectRepository`、`ProjectsService`、`ProjectStore` 等仍要维护两套语义。
4. 服务端承担 SQLite 迁移、备份恢复、持久任务、Outbox、素材一致性和 AI 工作流；这些确实比展示层更复杂，但当前复杂度也混入了大量合规证明和迁移期自建基础设施。
5. 前端也存在 2,000 行以上的单体 Vue 页面，问题更像产品设计、交互打磨和测试投入不足，而不是单纯“前端文件少”。

## 七、文档成本

- `文档/` 有 1,648 个 Markdown、127,776 行；其中 `05_执行与记录` 1,281 个文件、74,877 行。
- `文档/项目技术概览_供审核.md` 仍标 active，却还描述只有 6 个 model 和文件持久化。
- `文档/02_架构与契约/系统架构总览.md` 仍描述内存队列和未实现的持久任务，与现状冲突。
- 风险不只是“文档多”，而是活跃概览与代码事实相互冲突。执行证据可归档，当前事实入口必须少而准。

# 风险与判断

## 应继续保留

- 17 个已应用 migration、Prisma Schema、迁移 checksum、数据库完整性与关键 trigger 契约测试。
- 备份/恢复、final verifier 和 DB-only 故障恢复能力。
- 三个任务状态物化 trigger，以及暂时没有等价事务/FK/CAS 证明的 lease、fence、append-only、不可变版本和协调 purge 约束。

## 优先复核或迁出

1. 0017 的 9 张空表与 20 个 trigger：先验证数据模型和真实入口，必要时整体简化，而不是只删 trigger 留空壳。
2. 51 个 scope/owner trigger：逐个检查是否已被复合外键和同事务写入完全覆盖；只有等价时才迁出。
3. 应用层已有 CAS/状态机校验的 immutable/transition trigger：可选择一处成为事实源，但要保留并发和旁路写防护。
4. 可重建 projection/formalization trigger：只有完成所有读取点审计并提供重建/修复工具后才能移除。
5. G1 活跃 DSL、全量 rebuild/write CLI 和只服务它们的测试：满足 ADR 稳定周期门槛后退役；不可变 migration 与必要 SQLite 回归测试不删。
6. legacy file 兼容路径：从正常服务模块中隔离为一次性 importer/recovery 工具，避免主业务仓储长期维持双实现。

## 删除方式

- 不批量删除 trigger；每批最多 5～10 个，用新的 forward-only migration 完成。
- 每个删除项必须先证明替代约束，并覆盖真实 SQLite 的父表 DELETE、`SET NULL`、`CASCADE`、partial-null、回滚和 `foreign_key_check`。
- 先做模型和构建边界收缩，再做 trigger 微调。只减少 trigger 数字而保留 53 张表和双路径，不会实质降低复杂度。
- 在找到用户之前冻结新增基础设施、表、trigger 和过程文档，把下一阶段预算优先投入真实创作路径、UI/UX 和用户验证。

# 静态复核

- 代码行数已区分生产入口、离线工具、测试和 shared；没有以单一总行数替代复杂度判断。
- 表数已由 Prisma model 与运行 `sqlite_master` 双向核对；trigger 已按运行 SQL 复算，而非沿用历史文档。
- 生成器调用边界、构建边界、发布 identity 与 ADR 退役条件一致。
- Trigger 保留/迁出建议均说明替代证明和回归条件，没有提出无保护删除。
- 复核结论：通过。

# 运行复核

本次不改变运行行为；以标准 SQLite 元数据查询和现有自动化测试证据进行只读核验。

- 标准库 17 个 migration 全部成功。
- `PRAGMA integrity_check` 返回 `ok`；`PRAGMA foreign_key_check` 无结果。
- G1 manifest、Prisma Schema、migration 一致性检查通过；Prisma Schema 校验通过。
- G1、G2、G3、G4、G5、0017 共 10 个 trigger 契约测试文件、49 个测试通过。
- 用户页面与流程没有改变，因此页面 Runtime/User Review 不适用。
- 运行复核结论：通过。
