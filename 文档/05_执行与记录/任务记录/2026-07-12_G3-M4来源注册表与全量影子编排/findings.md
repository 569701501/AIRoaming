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
