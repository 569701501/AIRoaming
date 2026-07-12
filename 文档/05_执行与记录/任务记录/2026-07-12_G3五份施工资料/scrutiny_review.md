---
doc_id: AIR-TASK-20260712-G3-CONSTRUCTION-PACK-SCRUTINY
status: passed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3 五份施工资料、同步事实源与当前代码只读复核
---

# Scrutiny Review

## 1. 角色与范围

本轮以只读复核角色审查“施工资料是否足以让 Luna 开发”，不审查尚未实现的 G3 业务代码。复核输入：

- 五份 G3 施工资料。
- 2026-07-11 G3 主方案、契约字典与验收清单。
- 当前 Shared、Server、Persistence、G2 Task/Versioning、Web 与 E2E 入口。
- G3 开发就绪度审查中记录的 P0/P1。

## 2. 结论

```text
result: passed
scope: documentation_construction_readiness
business_implementation: not_started
runtime_evidence: not_applicable_for_docs_only
```

五份施工资料已经把原审查的 P0/P1 关闭到可施工级。Luna 可以按 `G3-A0/A1 -> B0/B1/B2 -> C0/C1/D0 -> E0` 实现 G3-core；不能据此开始 G3-M 或宣称 production-ready。

## 3. 原问题关闭情况

| 原问题 | 关闭证据 | 结论 |
| --- | --- | --- |
| 默认 file mode 与 importer 前提冲突 | file tagged reader、provenance serializer、ambiguity fail-closed、只读 audit | 已关闭 |
| `0010` 与 runtime ledger 未冻结 | 固定 migration/trigger/error、overlay inspection、G3 十段 ledger、G1 known overlay allowlist | 已关闭 |
| DB PATCH 范围不清 | 带 comicFormat 在 mode gate 前 409；不带字段维持 file/db 既有差异 | 已关闭 |
| G2 新消费点遗漏 | SourceSnapshot、Candidate/Prompt V2、两条 image input、worker、layout adapter 的精确清单 | 已关闭 |
| `policyVersion` 含义冲突 | 图片固定 `sizePolicyVersion`，G2 source projection 保持 `policyVersion` | 已关闭 |
| Web 错误状态不明确 | `ApiClientError`、`creatingProject/createProjectErrorCode`、modal 状态转移和成功路径 | 已关闭 |
| 验收依赖虚假前置 | `core_mandatory/rollout_gate/importer_deferred` 三类证据 | 已关闭 |

## 4. 架构一致性复核

| 核对项 | 结果 | 说明 |
| --- | --- | --- |
| canonical | 通过 | 新 runtime/API/DB/artifact 只有两值 |
| legacy input | 通过 | page alias 只在 file input boundary；歧义不猜测 |
| legacy output | 通过 | 旧 LayoutPage 只经命名 adapter；历史 JSON/digest 不改写 |
| DB migration | 通过 | 只新增 0010 单 trigger，不改 0008/0009/G1 manifest |
| migration readiness | 通过 | 最新 guard 精确校验 0001～0010，不串跑三套 guard |
| API immutability | 通过 | raw own property guard 早于 DB unsupported |
| task reproducibility | 通过 | V2 + size policy + width/height + digest；V1 不重放 |
| UI state | 通过 | 创建状态与列表错误分离，失败保留，成功不被 refresh 反转 |
| completion naming | 通过 | core、M、production-ready 明确分层 |

## 5. 当前路径核对

施工资料列出的既有入口均在当前仓库存在，包括：

```text
packages/shared/src/domain.ts
packages/shared/src/dto.ts
apps/server/src/projects/project-repository.service.ts
apps/server/src/projects/project-store.service.ts
apps/server/src/projects/versioning/source-snapshot-builder.service.ts
apps/server/src/projects/candidate-generation-spec.ts
apps/server/src/projects/persistent-g2-task-create-guard.service.ts
apps/server/src/projects/persistent-task-worker.service.ts
apps/server/src/projects/layout-export.service.ts
apps/server/src/persistence/g1-runtime-migration-ledger.ts
apps/server/src/persistence/g1-migration-plan.ts
apps/server/src/persistence/prisma.service.ts
apps/web/src/components/projects/CreateProjectModal.vue
apps/web/src/stores/workbench-store.ts
apps/web/src/services/api.ts
tests/e2e/api/workflow-api.smoke.spec.ts
tests/e2e/web/project-library-and-stage-rail.spec.ts
```

施工资料标注“新增”的 0010、G3 overlay/ledger、parser、file adapter/audit 和 G3 E2E 文件当前不存在，符合“业务实现尚未开始”，不是文档断链。

## 6. 静态验证

| 检查 | 结果 |
| --- | --- |
| `git diff --check` | 通过 |
| 五份施工资料存在且非空 | 通过 |
| 五份 frontmatter/doc_id/status | 通过 |
| 全文档 doc_id 重复扫描 | 0 重复 |
| G3 文档尾随空格 | 0 |
| G3 文档代码围栏奇数 | 0 |
| 施工资料当前代码路径存在性 | 0 缺失 |

本轮为 docs-only，没有运行 typecheck/Vitest/Playwright/SQLite migration；这些命令已写入第五份资料，必须由 G3 实现任务执行。

## 7. 残留风险

1. G3-M 依赖的 maintenance importer、决议 runner、备份恢复和 activate 仍不存在；真实 workspace 发布继续阻塞。
2. 当前 Shared/file runtime 仍为旧三值，Candidate/Prompt 仍是 V1；任何绿色结论都必须等实现后重新取得。
3. Luna 若发现当前代码和施工资料新的差异，必须命中 Stop condition 并更新 findings，不能用默认值或范围扩张消解。
4. 目标 workspace audit 由有权限的操作者显式执行；本轮没有读取真实 workspace。

## 8. 复核签署

结论仅签署“五份施工资料达到可独立施工级”。不签署 G3-core 完成、不签署 G3-M、不签署 production-ready。
