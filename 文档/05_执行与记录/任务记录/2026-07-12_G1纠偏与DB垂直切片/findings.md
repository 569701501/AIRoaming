---
doc_id: AIR-TASK-20260712-G1-CORRECTION-FINDINGS
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 纠偏代码与文档探索证据
---

# Findings

## 2026-07-12 基线

- `G1SchemaReviewAttestationV1.independentFromWorker` 只校验字面量 `true`；没有外部签名、密钥、账号或权限域，不能形成真实独立信任边界。
- r5 在真实 Prisma Schema 首次 validate 前先完成双审；后续 validate 暴露 106 个错误并使摘要失效，证明执行顺序错误。
- 旧总控把 G2 前置到 G1-10 `WIT-01`，导致 G1 大部分业务切片未做时 G2 结构性无法开始。
- 当前生产业务源码没有 `PrismaClient` 接线；正式 migration tree 不存在。
- 默认 file runtime 必须保留到正式切换授权，本任务只新增显式临时 DB 模式。

## 2026-07-12 C1/C2 结果

- 直接校验入口 `loadCurrentG1SchemaManifestV1` 同时证明两件事：仓库内 manifest 自摘要有效；manifest 与当前文档、生产源码和 package source closure 重建结果逐字一致。Schema/migration 不再从 review 文件取得授权。
- 写入竞态防护未因移除 review gate 而下降：Schema 在 staging rename 前重新校验当前输入并核对 exact bytes；migration 在 staging tree rename 前重新校验当前输入，并在 staging 与 final 两处执行 exact tree 校验。
- persistence 规模从实现 11710/测试 6045/CLI 439 行降至实现 9008/测试 3346/CLI 122 行；减少量分别为 2702、2699、317 行。删除的是自签审查协议及其测试，不是 Schema/SQLite 约束验证。
- 正式 migration tree 已存在并可由当前 manifest 确定性重建；`0008` 对 43 张带 CHECK 的表做等值重建，保存前后行数和值差异 guard、FK mode guard、pre-COMMIT `foreign_key_check` guard 和 194 个 trigger。
- fresh deploy 与二次 deploy、Prisma ledger checksum、SQLite master inventory、integrity/FK 均已真实执行；另有 P3018/P3009、孤儿 FK、值改写和外层事务故障测试证明失败时回滚或阻断。
- C1/C2 只完成可执行数据库 artifact，不代表业务运行时已经使用 Prisma；`PrismaClient` 生命周期与 Project/Chapter/Script 重启回读仍属于 C3。
- 历史 `reviews/` 文档按 ADR-0014 保留，不参与源码 closure、写入授权或 package scripts；其他事实源中的旧双审叙述留待 C4 统一消冲突。
- Node 22 的 `node:sqlite` 在测试输出中仍有 experimental warning；不影响本次断言结果，但属于后续运行时选型需持续关注的非阻塞风险。

## 2026-07-12 C3 结果

- 真正的 DB 竖切已经存在：不是直接在测试中调 Prisma 写行，而是通过现有 `ProjectsService` 公开创建/保存/完章/读取 API，中间经过 `ProjectStore` 和 `ProjectRepository`，关闭并重建 Nest 上下文后仍可从 SQLite 重建本地领域对象。
- Project/Chapter 的循环当前指针不能依赖临时关闭 FK/触发器；最小可执行顺序是先建 `Project(currentChapterId=null)`，再建 Chapter，最后在同一事务内回填 Project 指针。完章则先建 ScriptVersion，再回填 Chapter 版本指针。
- 旧 file 模式的 `chapter_001` 只在每个目录树内局部唯一，而 DB `Chapter.id` 是全局主键；DB 切片必须改为包含 projectId 的 ID，file 模式仍保留原 ID，避免对旧 workspace 造成不必要迁移。
- 公开漫画格式 `page_horizontal` 与 G1 物理 Schema `paged_comic` 名称不同；映射属于 Repository 适配责任，读写双向已锁定。Schema 不接受的 `four_panel` 不能暗中改值，当前显式 fail-closed。
- C3 的事实源是 Project、Chapter、ChapterScriptVersion 三类 DB 行；不生成 workspace 项目树，不双写 file，也不会在 DB 路径不受支持时静默回退。
- Prisma 客户端生成已收口到根级 `prisma:generate` 和 `postinstall`；server `package.json` 是 G1 manifest source closure 的绑定输入，本次没有为生成命令重写它，manifest digest 仍为 `sha256:ece90ac09e42740ce3a18509f04e9b8c623dfe073db659309cf18d7064ceced1`。
- C3 只消除“Schema 和 migration 有产物、但没有业务代码真正用 DB”的核心缺口，不等于 G1 全量数据库化。运行时不自动 migrate，其他领域写入及真实数据切换继续禁用，不应把 C3 结果扩大解读为 DB-only 全站已完成。
- `scriptWorkingState` 不能由“发生了保存动作”推导，必须由 working digest 与 current ScriptVersion digest 的事实比较推导；否则重复保存相同内容会制造假 `dirty`，破坏 G2 freshness 基线。

## 2026-07-12 C4 文档收口

- 旧入口同时存在“0/2 双审前不得生成 migration”“正式 tree 不存在”和“G1 尚未实现”等描述，已经与 C1～C3 可执行事实冲突；纠偏后，历史 review 细节仍保留，但明确标为 `historical/not_applicable`。
- Schema 实施契约是 manifest 绑定输入，不能批量重写。C4 只在顶端添加 ADR-0014 覆盖说明，再由生成器更新 manifest；Schema/migration 字节保持不变。
- G2 开工条件与 G1 完成条件必须分开：正式 migration tree + C3 Project/Chapter/Script substrate 足以开始 G2；G2 自身仍需 current/version 发布事务、expected rowVersion/CAS、并发冲突、失败回滚、迟到写隔离与重启证据。
- C3 是单进程最小切片，没有跨进程 rowVersion/CAS 并发保护。G2 正式 current/version 发布事务、完整 DB-only importer 与生产 cutover 都仍是后续工作，不能从“重启读回通过”推导完成。
- 聚合门禁证实 C1～C4 没有破坏默认 file 用户路径或 G0 隔离框架；当前 server 基线为 24 个测试文件、156 个测试。Prisma validate 依赖 `DATABASE_URL` 即使只做 schema 校验，验证命令必须显式给安全临时 URL。

## 2026-07-12 C5 Scrutiny 修复

- “migration tree 生成/测试正确”不等于“运行时只会打开正确数据库”。DB 模式必须在任何项目加载或写入前，独立验证实际连接库的 Prisma ledger；否则 0008 的 195 CHECK/194 trigger 全缺仍可能接受业务写。
- 现有 `assertG1FreshMigrationLedgerV1` 位于 manifest-bound 生成器模块。运行时直接 import 会把 Markdown/source closure/生成器带进启动链，也会改动冻结的 19 份源；因此修复保留相同 ledger 语义，但用独立小模块从正式 migration SQL 原始字节复算 expected checksum。
- 成功 ledger 的必要形状是 8 个名称 exactly-once、无额外行、checksum 精确、`finished_at` 非空、`rolled_back_at` 空、`logs` 空、`applied_steps_count=1`。P3018 行即使 migration_name/checksum 存在也必须按 failed 拒绝。
- Project readback 的“找不到 current 就选第一章”会掩盖损坏指针并改变用户正在编辑的章节；DB 模式必须把 current 指针作为事实，null 或跨项目/缺失都拒绝加载。
- 自动创建下一章不等于自动切换当前章。当前产品契约保持 current=刚完成的第一章；重启后 chapter_002 必须可枚举，但不能被 fallback 误选为 current。

## 2026-07-12 C5 最终复核

- 最终 Scrutiny 只读复核通过，无 P0/P1 或新增可操作 P2；原 migration ledger P1、current pointer P2 和第二章重启证据 P2 均关闭。
- 最终 Runtime/User Review 在 marker 临时根内复现正式 8 段正例、0001～0007 缺失负例、真实 0008 P3018 残库负例与无 ledger 稳定错误；没有业务补写或真实数据副作用。
- 纠偏任务的退出条件已经满足，但它不是完整 G1 或 G2 完成证明。G2 仍需实现 expected rowVersion/CAS、正式 current/version 发布事务、并发冲突、失败回滚和迟到写隔离。
