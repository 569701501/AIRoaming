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
- full orchestration 仍是 shadow 施工入口，不代表 API DTO 等价、DB-only 或 production cutover 已完成。
- 双 fresh DB 的数据库层确定性已得到证据，但公共 API read-model 尚未把完整导入实体映射回 `WorkbenchSnapshot`，Asset 物理 hash 对照和 DB-only 写隔离仍未验收。
