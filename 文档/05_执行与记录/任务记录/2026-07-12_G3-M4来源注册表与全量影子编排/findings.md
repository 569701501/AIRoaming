---
doc_id: AIR-G3-M4-REGISTRY-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
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

# M4 结论

- 实现门禁和临时环境证据已齐：来源注册表、16-slice full shadow、fresh/replay、DB read-model/API、Asset physical evidence、DB-only 写隔离和 pending Dialogue 均有测试证据。
- `IMP-M3-FULL-02` 已补充 blocked prerequisite fail-fast 证据；它证明未决议的 Project/Chapter 不会触发后续 15 个下游 slice。
- final cutover 前投影读取点静态审计见 `projection_read_point_audit.md`：Project/Chapter 等业务投影和 Task 持久读已走 DB，物理 Asset storage 仍按允许的 storageKey 读写；SettingsService 仍读写旧 `app-settings.json`，必须作为 M5 capability/SecretStore blocker，不能在 M4 伪装成 DB-only。
- 本结论不是 production cutover 批准；M4 状态继续保持 `in_progress`，等待正式验收签字。M5/M6 不在本轮范围内。
