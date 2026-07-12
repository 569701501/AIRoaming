---
doc_id: AIR-TASK-20260712-G3-CONSTRUCTION-PACK-FINDINGS
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: 当前 G3 文档、G1/G2 代码与迁移树复核
---

# finding

## 审查输入

- `文档/05_执行与记录/任务记录/2026-07-12_G3文档开发就绪度审查/`
- G3 主方案、契约字典、验收清单与 ADR-0009。
- 当前 Shared、Projects、Persistence、G2 Versioning/Task Runtime 和 Web 项目库代码。

## 待冻结问题

1. file mode 在完整 importer 缺席时如何处理 canonical、auto-map 与 ambiguity。
2. G3 `0010` 如何继承 G1/G2 migration exactness 并成为最新 runtime startup guard。
3. G3 是否扩大 DB mode 普通 metadata PATCH。
4. 候选尺寸版本如何与 G2 `TaskSourceProjection.policyVersion` 分词。

## 已冻结裁决

### D1：交付拆成 G3-core 与 G3-M

- Luna 当前施工范围是 `G3-core`：canonical 契约、0010、Create/PATCH 保护、现有弹窗、只读标签、file 兼容读取和 G2 下游适配。
- `G3-M` 是 maintenance importer、MigrationIssue 决议、备份恢复与 DB-only activate；继续归 G1 切换体系，当前为 `integration_blocked/release_blocked`。
- 完成 G3-core 不等于完整 G3 production cutover；完成记录必须使用精确名称。

### D2：file mode 使用只读兼容边界，不自动迁移

- canonical 文件值直接读取。
- `page_horizontal` 仅在 file repository 边界映射为 runtime `paged_comic`，并保留内部 provenance；任何普通写回继续保存原始 alias，不能借无关编辑静默迁移。
- `four_panel/缺失/非法` 返回 tagged `decision_required`，项目加载不得回退为 vertical，也不得 catch 后静默跳过。
- 增加只读 audit 命令用于 rollout inventory；它不是 importer，不写文件、不创建 MigrationIssue。

### D3：数据库追加独立 0010 并升级最新 runtime ledger

- 名称固定 `0010_g3_comic_format_immutable`。
- 只新增一个 `BEFORE UPDATE OF comic_format` trigger；0 表、0 字段、0 index、0 CHECK、0 rebuild。
- 不修改已应用的 0008/0009，不修改 G1 machine manifest 计数。
- 新建 G3 overlay contract 与 G3 runtime ledger；`PrismaService` 在 G3-core 激活时精确验证 0001～0010。
- G1 artifact check 只把 0009/0010 识别为已知 post-G1 overlay，不放行任意未来目录。

### D4：G3 不扩大 DB metadata PATCH

- PATCH 原始 body 出现 `comicFormat` 时，在任何 persistence mode 都先返回 `409 COMIC_FORMAT_IMMUTABLE`。
- 不含该字段时，file mode 保持现有 update 行为；db mode 继续返回既有 `DB_PERSISTENCE_OPERATION_UNSUPPORTED:update_project_draft`。
- DB 侧只要求 trigger 能保护未来 repository/脚本，不为 G3 新增通用 Project metadata command repository。

### D5：尺寸版本使用 sizePolicyVersion

- 字段名固定 `sizePolicyVersion`，值固定 `legacy_generation_default_v1`。
- 不复用或覆盖 G2 `TaskSourceProjection.policyVersion=g2-task-source-v1`。
- 新 CandidateGenerationSpec 升级为 schemaVersion 2；digest 包含 `sizePolicyVersion + requestedSize`。
- file/DB 两条新图片任务 input 的 `image` 都保存 `width/height/sizePolicyVersion`；旧 V1 input 只读历史，不重放为新 command。

# web_search

本轮不需要网络搜索；全部问题由项目事实源与当前仓库决定。

# 同步结论

- 2026-07-11 主方案继续承担产品目标；2026-07-12 五份施工包承担实际代码施工优先级。
- 原 G3 验收清单已拆分 `core_mandatory/rollout_gate/importer_deferred`，MIG-01～15、RST-03/05 不再伪装为当前可运行前置。
- 上位架构已记录 Candidate/Prompt V2、精确 `sizePolicyVersion`、file provenance 和 G3-core/G3-M 完成语义。
- 当前实现仍是旧 Shared/file 三值与 Candidate V1；施工资料完成不改变业务实现状态。
