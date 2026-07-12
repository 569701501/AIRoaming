---
doc_id: AIR-G3-M4-REGISTRY-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent
source: code exploration and tests
---

# 发现

- `Chapter.sourceDigest` 并非 chapter.json 单文件摘要，而是 `digestCanonicalJson({ chapterJsonDigest, scriptDigest })`；验证器必须读取 sealed source payload 重算。
- Dialogue importer 使用 `RuntimeBundleFileService` 的 canonical envelope digest，而 snapshot manifest 的 runtime 文件项是原始 bytes sha256；两者不能直接比较，必须锚定 `sealed.runtimeBundleDigest`。
- Provider 使用脱敏的 `settings.redacted.json`，它属于 snapshot manifest 转换输入，不在原始 source manifest；验证器必须检查两个 manifest 的并集。
- AssetVisual 会在 Asset metadata 中追加 `physicalEvidence`，因此 full replay 时 Asset metadata 校验必须允许可证明的后置证据增强，不能把合法 promote 误报 payload conflict。
- full importer 目前保留 16 个独立 MigrationRun，不伪造新的 `kind=full` ledger run；聚合 reportDigest 排除 runId，满足双轮结果可比对。
- `ProjectScriptOutline` 的来源摘要是 `digestCanonicalJson({ markdownDigest, metadataDigest })`，不能把 `script-outline.md` 的单文件 sha256 当作实体 digest；双 fresh DB 测试已覆盖该复合来源注册。

# 风险

- 当前注册表覆盖现有 importer 已使用的 entityType；未来新增复合来源必须先注册算法，否则 verifier 会 fail-closed。
- full orchestration 仍是 shadow 施工入口，不代表 production cutover 已完成。
- 已补 DB full read-model：Project/Outline、Chapter script/pending/revision、Story/Storyboard V2→公共 V1 DTO、Preflight、Character/Visual、Asset、Candidate/Lock、LayoutWorkingCopy 均在 `ProjectRepository` 组装；公共 DTO 对照以稳定语义字段比较，目标 ID 仍由 release stable identity 生成。
- Asset importer 将旧 `name/path` 作为 `legacyName/legacyPath` 保留在 metadata 侧，公共 API 继续返回旧 DTO 的名称和路径；物理 ready 证据仍使用 DB 的 sha256/bytes，公共 `meta` 排除迁移内部字段。
- DB-mode `saveChapterDraft` 已允许完整导入项目树通过写入门禁，只更新数据库 working copy；API 集成测试证明旧 workspace 的 `project.json` 与 `script.md` 字节不变。
- Pending Dialogue 的 runtime bundle 是显式 `dialogue_pending_state_v1`，只捕获 ScriptDialogueService 实际持有的 `script_import`、`inspiration_seeds`、`script_outline_decision` 三类 Map；StoryStructure/Storyboard 继续使用各自领域 pending 真值，不重复建模。
- `PendingDialogueArtifact` 的 project/chapter/thread 与可选 message/toolResult 引用均在导入前解析为稳定 target；未注册 kind、非 pending 状态、跨 scope 或缺失引用 fail-closed，不创建伪恢复项。
- full shadow 原尾部顺序为 `providers → dialogue`，与导入契约的 `Dialogue/pending → Provider metadata` 不一致；已改为 `dialogue → providers`。同时，前置 slice 返回 `blocked` 时必须停止编排，避免下游以空输入生成看似成功的 run。
- 来源注册表不仅要拒绝未知 `entityType`，还要验证已注册实体的摘要和 runtime 锚点；`IMP-M4-04`、`IMP-M4-05` 已证明摘要篡改或 runtime 偏离 `runtime-bundle.json` 时 verifier fail-closed。
- 单文件实体此前只按 manifest digest 校验，未限制实体与 storage key 的对应关系；已为全部单文件 entityType 增加允许路径模式，`IMP-M4-06` 证明 Project 使用 chapter.json 的合法摘要也会 fail-closed。
- full shadow 原先对底层 importer 的 failed 异常直接上抛，聚合结果会丢失失败 run；现改为使用显式 slice runId 捕获 failed 终态、写入聚合摘要并停止，`IMP-M3-FULL-03` 已覆盖重复章节约束冲突。
- Chapter importer 在缺少 `script.md` 时会从 `chapter.json.sourceText` 生成备用正文摘要；verifier 注册表现已镜像该 fallback，`IMP-M4-07` 证明合法缺文件快照不会被误报为来源摘要篡改。
- `db-verify` 原先忽略 `--format`，与 G3-M CLI 稳定参数契约不一致；现只接受 `json`，非法值在数据库初始化前以 `MIGRATION_VERIFY_ARGS_INVALID` fail-fast。
- 审计发现其余 G3 CLI 对 `--format` 缺值或非法值的处理不一致，`snapshot`/`maintenance` 甚至可能先执行副作用；新增共享 `readJsonFormat`，接入 8 个 CLI，统一拒绝缺值、非法值和重复 flag，并在各自副作用前返回稳定错误码。`cli-format.spec.ts` 锁定 5 种参数边界，额外用 `db:verify`、`db:snapshot`、`maintenance` 入口 fixture 复核 fail-fast。
- 来源注册表原先只有行为测试，没有防止新增 importer 忘记登记 entityType 的静态契约；新增测试动态扫描所有 `*-shadow-importer.ts` 的来源写入点，要求每个 entityType 恰好落在 single/composite/runtime 某一类，避免未知类型在运行时才暴露。
- verifier 原先未区分 `MigrationRun.kind`，成功的 audit run 在没有来源计数时可能 vacuous pass；现要求目标 run 必须为 `shadow`，否则返回 `MIGRATION_RUN_KIND_INVALID`，由 `IMP-M4-11` 固化。
- 仅判断当前 run 是否存在任意来源行仍不足以证明来源完整：A6 的 `Shot` 是由 `StoryboardShotProjection` 留证，A9 的 `AssetReady` 由 `AssetPhysicalEvidence` 留证，且报告计数中还包含部分上下文计数。verifier 现维护 importer-specific `(countKey → entityType)` 绑定，按每种来源行精确比较；缺失返回 `MIGRATION_SOURCE_EVIDENCE_MISSING`，超额或未绑定类型返回 `MIGRATION_SOURCE_EVIDENCE_COUNT_MISMATCH`，不会把部分证据当作通过。
- 进一步发现已知 importer 的 `counts.entityCounts` 缺失或带未注册键时，旧实现会退化为空/部分映射；若来源行也为空，存在再次 vacuous pass。现要求结构存在、绑定键完整、值为非负整数，并只允许 `Project` 及 A6 `Shot` 这类明确上下文键；缺失返回 `MIGRATION_SOURCE_ENTITY_COUNTS_MISSING`，结构不合法返回 `MIGRATION_SOURCE_ENTITY_COUNTS_INVALID`。`IMP-M4-14/15` 已锁定该边界。
- 继续发现 succeeded shadow 可没有 run verification，或把 `sourceManifestVerified`/`snapshotManifestVerified` 声明为 false 仍带着完整 counts 通过。现要求 verification 为 schemaVersion=1 且两个 manifest verification 标志均为 true；缺失/无效分别返回 `MIGRATION_RUN_VERIFICATION_MISSING` / `MIGRATION_RUN_VERIFICATION_INVALID`，由 `IMP-M4-16/17` 锁定。
- 继续发现成功 shadow 仍可省略 `decisionsDigest`，或在账本被外部篡改时携带非规范 report digest。verifier 现要求 `decisionsDigest` 存在且为 `sha256:<64位小写十六进制>`，并独立检查 `reportDigest` 形状；缺失/非法分别返回 `MIGRATION_DECISIONS_DIGEST_MISSING`、`MIGRATION_DECISIONS_DIGEST_INVALID` 或 `MIGRATION_REPORT_DIGEST_INVALID`。这只做摘要形状与存在性门禁，不声称 verifier 能从数据库反推出完整报告正文；`IMP-M4-18/19` 已锁定。

# M4 结论

- 实现门禁和临时环境证据已齐：来源注册表、16-slice full shadow、fresh/replay、DB read-model/API、Asset physical evidence、DB-only 写隔离和 pending Dialogue 均有测试证据。
- `IMP-M3-FULL-02` 已补充 blocked prerequisite fail-fast 证据；它证明未决议的 Project/Chapter 不会触发后续 15 个下游 slice。
- final cutover 前投影读取点静态审计见 `projection_read_point_audit.md`：Project/Chapter 等业务投影和 Task 持久读已走 DB，物理 Asset storage 仍按允许的 storageKey 读写；SettingsService 仍读写旧 `app-settings.json`，必须作为 M5 capability/SecretStore blocker，不能在 M4 伪装成 DB-only。
- 本结论不是 production cutover 批准；M4 状态继续保持 `in_progress`，等待正式验收签字。M5/M6 不在本轮范围内。
- `IMP-M4-08` 覆盖 unchanged replay 的当前 run 空来源；`IMP-M4-09` 覆盖摘要正确但来源行超额；`IMP-M4-10` 对成功 full shadow 的 16 个 slice 逐个执行 verifier。三组证据共同证明 verifier 的来源证据计数门禁 fail-closed，且不修改 schema/migration/trigger。
