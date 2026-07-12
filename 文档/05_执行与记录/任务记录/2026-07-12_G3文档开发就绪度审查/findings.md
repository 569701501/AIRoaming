---
doc_id: AIR-TASK-20260712-G3-READINESS-FINDINGS
status: complete
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G3 文档开发就绪度审查任务
---

# 审查发现

## 1. 总结

现有三份 G3 正式文档对产品规则、canonical 值、错误码、不可变要求、旧值分类和验收场景描述充分；问题不在“写得少”，而在文档仍按 2026-07-11 的目标架构前提编排，没有根据 2026-07-12 已落地的 G1/G2 代码重新冻结施工边界。

因此 Luna 可以理解 G3 要做什么，也可以实现一部分新项目路径，但不能在不做架构猜测的前提下完成整个 G3。

## 2. 已经足够明确的内容

| 范围 | 已冻结事实 |
| --- | --- |
| 产品入口 | 复用现有创建项目按钮和 `CreateProjectModal.vue`，不新增向导 |
| 领域值 | runtime 只允许 `vertical_scroll/paged_comic` |
| 创建规则 | `comicFormat` 默认空、必选、不得静默默认 |
| 更新规则 | PATCH 原始 body 只要含 `comicFormat` 就返回 409；同值也拒绝 |
| 数据规则 | Project 字段非空、无默认、两值 CHECK、创建后不可变 |
| 旧值语义 | `page_horizontal` 可映射；`four_panel/缺失/非法` 需要决议 |
| 用户语义 | `paged_comic` 表示分页阅读，不等于横屏 |
| 测试意图 | parser、API、SQL、Web、下游、迁移、重启和故障场景均已枚举 |

## 3. 阻塞项

### P0-1：旧数据迁移前提与当前运行时矛盾

文档把 G1 maintenance importer、备份/恢复和 DB-only 当作已完成前提；验收清单第 1 节也明确如此声明。当前代码事实是：

- `PrismaService.readPersistenceMode()` 在未配置时仍返回 `file`，只有显式配置才进入 `db`。
- `apps/server/src/persistence/` 只有 Schema、migration、ledger 与 overlay 设施，没有可运行的 maintenance importer、决议执行器、备份/恢复或 DB-only activate 流程。
- file mode 仍由 `ProjectRepository.readProjectFromWorkspace()` 读取 `project.json`，并通过 `normalizeComicFormat()` 把缺失或非法值静默设为 `vertical_scroll`。
- 该加载循环遇到严格解析失败会记录 warning 并跳过整个项目。

G3 又要求 runtime 不得保留旧 alias 或 fallback。若 Luna 直接按文档删除 fallback，现有默认 file mode 中的旧项目可能被跳过；若保留 fallback，又违反 G3 退出标准。

施工前必须只选一个正式策略并写入架构事实源：

1. 先补最小 maintenance importer 与切换链，再实施完整 G3；或
2. 明确一个仅用于 file mode 读取期的、只读且可审计的兼容 adapter，并规定删除门；或
3. 把本轮范围限制为全新 canonical 项目，明确旧项目兼容和 G3 complete 均后置。

在该决策完成前，不得让 Luna自行选择。

### P0-2：G3 migration/ledger 接入方式未定义

当前正式迁移树为 `0001～0009`。G3 文档要求增加 Project comicFormat immutable trigger，但没有冻结：

- 新迁移的编号和名称；
- 它是否是独立 overlay；
- overlay 的 SQL 形状检查与数据库 inspection 契约；
- 现有 G1/G2 artifact 与 `_prisma_migrations` ledger 如何接受新迁移；
- `PrismaService` 启动时究竟执行 G1、G2 还是新的 G3 ledger guard。

现有 `g1-runtime-migration-ledger.ts` 只把 `0009_g2_version_freshness_overlay` 当作唯一可忽略特例，其他目录或 ledger 行都会失败。`g2-runtime-migration-ledger.ts` 又是 opt-in，且注释明确 `PrismaService` 仍只执行 G1 guard。Luna 直接增加 `0010` 会导致启动门禁失败，或出现 migration 存在但运行时未正式验证的双重风险。

必须先冻结 `0010` 的名称、SQL/inspection 契约、ledger 继承关系、启动激活点与测试命令；不能修改已经应用的 `0008/0009` 来偷渡 G3。

### P0-3：缺少基于当前 G2 实现的施工依赖图

G3 原规划只给出 G3-A～E 粗阶段。当前仓库在规划后已经新增 G2 版本链、Preflight codec、持久任务创建门禁和 worker，实际改动面已变化：

- Shared 总体 `ComicFormat` 仍是旧三值，但 G2 `PreflightSourceSnapshotV1` 已使用新两值。
- `SourceSnapshotBuilder` 当前把所有非 `vertical_scroll` 值都转成 `paged_comic`，会把损坏数据静默当作分页漫画。
- file-mode preflight 与 Project repository 仍使用旧 `normalizeComicFormat()`。
- DB repository 仍在 `page_horizontal <-> paged_comic` 间双向转换，导致 API/runtime 看见旧值。
- G2 图片任务已直接根据 canonical `styleCheck.comicFormat` 选择宽高，不能只修改旧 `candidate-generation-spec.ts`。

现有文件清单没有把这些 G2 后置代码逐项纳入阶段、编译门和回归测试。独立开发者无法判断先改 Shared、repository、SourceSnapshot 还是 task runtime，也无法判断哪些旧路径是兼容层、哪些必须删除。

## 4. 重要但可在施工包中补齐的问题

### P1-1：候选尺寸 policyVersion 的字段位置不明确

文档要求任务 input 保存 `width/height + policyVersion`，但当前有三种相关结构：

- `CandidateGenerationSpec.requestedSize`；
- `CandidateGenerationTaskInput.image`；
- G2 `TaskSourceProjectionV1.policyVersion = g2-task-source-v1`。

若只新增泛化的 `policyVersion`，容易与来源投影版本混淆。应明确字段名与归属，例如 `candidateGenerationSpec.sizePolicyVersion`，并冻结是否升级 generation spec schemaVersion、是否进入 digest、旧任务如何 decode。

### P1-2：Web 创建错误状态仍是“建议”而非契约

主方案只“推荐”新增 `createProjectErrorCode`。当前 store 只有全局 `error`，`ProjectLibraryView` 会把创建字段错误显示成“项目服务连接失败”，而 `CreateProjectModal` 没有 error prop。验收清单却要求字段级中文提示、保留输入、`role=alert` 和 `aria-invalid`。

需要冻结专用状态名、打开/关闭/成功/失败时的清理规则、modal props 和错误码到文案的唯一映射。

### P1-3：DB 更新与测试证据来源未落到可执行入口

- 当前 DB mode 明确不支持 `update_project_draft`，但验收要求 DB 模式下 name-only PATCH 成功、带 comicFormat 的 PATCH 409。
- `ProjectListItem` 不暴露 Project `rowVersion`，验收却要求失败前后读取它；应明确由测试直接查询 SQLite，而不是擅自扩 API。
- backup/restore、MigrationIssue、decisionsDigest 和 importer 的验收项当前没有实现入口，不能在本轮伪造为可执行 mandatory 用例。
- API 日志脱敏、`aria-busy` 的挂载节点和采集方式没有冻结。

验收清单需要分成“本轮 mandatory 可执行”和“依赖 importer/切换的 deferred”两组，并为每项写明 spec 文件与证据来源。

### P1-4：HTTP 原始 body 的未知字段策略未完全冻结

文档明确 create comicFormat 与 update forbidden-field 的行为，但没有统一说明 create/update 其他未知字段是拒绝还是剥离。若新增 `project-input.contract.ts`，需要给出 exact allowlist、错误码和 Controller 接法，避免 Luna 自行引入全局 validation 行为。

## 5. 追踪结论

| 层 | 文档就绪度 | 结论 |
| --- | --- | --- |
| 产品与领域语义 | 足够 | 可施工 |
| Shared DTO/parser | 较完整，但缺当前 G2 编译顺序 | 有条件施工 |
| Server Create/PATCH | 错误语义明确，DB update 范围未定 | 有条件施工 |
| SQLite 约束 | 目标明确，migration/ledger 接法缺失 | 不可直接施工 |
| file mode/旧项目 | 与当前默认运行时冲突 | 不可直接施工 |
| Web 表单与只读展示 | UI 目标明确，错误状态未冻结 | 有条件施工 |
| G2/候选/排版下游 | 方向明确，精确字段和调用点不全 | 有条件施工 |
| 自动化验收 | 场景丰富，但部分前提不存在 | 不可整包执行 |

## 6. 最终判断

正式判定：**不通过直接施工门禁**。

这不是推翻 ADR-0009 或 G3 的产品设计。结论仅表示：当前三份资料还不能作为“Luna 无需聊天上下文即可完成完整 G3”的施工包。若现在交付，Luna 最可能在 file 兼容、`0010` ledger、policyVersion 和 DB PATCH 范围上自行做架构决策，产生数据丢失、启动失败或返工风险。
