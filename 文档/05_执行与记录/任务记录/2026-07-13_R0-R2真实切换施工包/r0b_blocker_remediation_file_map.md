---
doc_id: AIR-RCUT-R0B-REMEDIATION-FILEMAP-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: developer, reviewer, ai-agent
source: 当前 migration importer 代码与 R0-B 修复契约
---

# R0-B 阻塞修复文件与函数地图

## 1. 必改实现

| 文件 | 当前问题 | Luna 修改目标 |
| --- | --- | --- |
| `apps/server/src/migration/story-shadow-importer.ts` | `legacyDocument()` 原样复制 beat character 名称，V2 编码报 unknown character id | 在编码前使用纯 resolver，把 ID/唯一精确名称解析为 structure character card id；保留现有 projectCharacterId 稳定映射 |
| `apps/server/src/migration/storyboard-shadow-importer.ts` | 非空 `characterIds` 无条件报错；未读取 shared characters；未写 child rows | 解析 legacy token 到稳定 DB Character id；验证目标存在；创建/replay `StoryboardShotCharacter` 后再确认版本 |
| `apps/server/src/migration/full-shadow-importer.ts` | `storyboard` 在 `characters` 前 | 调整为 `story -> characters -> storyboard`，保持其余相对顺序和 16 slices |
| `apps/server/src/migration/migration-verify.service.ts` | g3-m3-a6 的 contextual count allowlist 只允许 `Project`、`Shot` | 把 `StoryboardShotCharacter` 登记为 A6 派生关系 contextual count；不要把它加入 source-evidence binding |

## 2. 建议新增深模块

### `apps/server/src/migration/legacy-character-reference.ts`

职责只包括：

- 构建 ID 索引和 exact-name 多值索引。
- 按 ID 优先、唯一精确名称次之解析 token。
- 保持输入顺序和重复项。
- 返回 `id | exact_name` 解析方式或 `unresolved | ambiguous` 结构化错误。

禁止该 helper：

- 读取文件/数据库。
- 依赖 Prisma 或 importer error class。
- 做模糊/别名/大小写猜测。
- 记录真实名称到日志。

建议导出：

```ts
export interface LegacyCharacterCandidate {
  sourceId: string;
  exactName: string;
  targetId: string;
}

export class LegacyCharacterReferenceError extends Error {
  readonly kind: "unresolved" | "ambiguous";
}

export function resolveLegacyCharacterTokens(
  tokens: readonly string[],
  candidates: readonly LegacyCharacterCandidate[],
): LegacyCharacterResolution[];
```

Importer 捕获 helper error 后转换为本 importer 的稳定迁移错误码。

## 3. Storyboard 结构改动点

`BoardPlan` 至少需要携带：

- legacyProjectId，用于稳定 source key。
- 每个 shot 的 legacy id、target shot id、projection source。
- 每个 resolved character 的 target id 与 order。
- child row 的确定性 id 或足以确定性计算 id 的字段。

`buildPlans()` 的目标流程：

1. 读取 chapter/storyboard。
2. 若 shot token 非空，读取同一 snapshot 的 `shared/characters.json`。
3. 构建 legacy ID/name -> stable DB ID candidates。
4. 解析每个 shot，生成 V2 document。
5. payload digest 必须覆盖已解析 document；同 appCommit + 同 snapshot 结果确定。

`importPlan()` 的目标流程：

1. pending version。
2. shot rows。
3. projection rows。
4. 查询并验证 resolved Character project scope。
5. child rows 按 order 创建或精确 replay 校验。
6. confirmed version。
7. chapter current pointer。

必须新增 `StoryboardShotCharacter` report count，并在 `migration-verify.service.ts` 的 g3-m3-a6 contextual count allowlist 中显式允许；不为 derived child 单独创建 `ImportedEntitySource`，也不把它加入 source count binding。其来源由 storyboard source digest 和 projection payload digest 覆盖。若 Luna 判断必须改变 source-evidence 设计，应先停止请求决策，不能顺手扩大协议。

## 4. 必改/新增测试

| 文件 | 修改 |
| --- | --- |
| `apps/server/src/migration/legacy-character-reference.spec.ts` | 新增 R0B-REF-01～06 纯函数测试 |
| `apps/server/src/migration/project-chapter-shadow-importer.integration.spec.ts` | fixture 支持 story beat/shot 非空人物引用；新增 Story/Storyboard/Full/replay/fail-closed/child-row 测试；更新 order 断言 |
| `apps/server/src/backup/app-backup-restore.integration.spec.ts` | 确认新的 slice order 在 backup/restore manifest 与验证路径中通过 |

若实际拆成更窄 spec，可调整文件，但必须覆盖测试矩阵所有 ID，并同步文档命令。

## 5. 需要静态核对、通常不改

| 文件 | 核对点 |
| --- | --- |
| `packages/shared` 中 StoryDocumentV2 codec | beat characters 必须存在于 document characters[].id |
| `packages/shared` 中 StoryboardDocumentV2 codec | shot characterIds 为非空稳定 ID 数组 |
| `apps/server/src/persistence/g1-schema-trigger-dsl-core-b.ts` | schemaVersion=2 要求 child source_token/character_id 等于 document character id；本任务不得修改 trigger |
| `apps/server/src/projects/versioning/storyboard-version.repository.ts` | 参考正式业务路径创建 projection + child 的事务顺序 |
| `apps/server/src/migration/final-importer.ts` | 消费 `FULL_SHADOW_SLICE_ORDER` 后仍为 16 slices |
| `apps/server/src/backup/app-backup.service.ts`、`app-restore.service.ts` | 顺序绑定随常量更新并由集成测试证明 |

## 6. 执行留痕文档

Luna 执行后更新：

- `progress.md`
- `findings.md`
- `task_plan.md`
- `evidence_and_test_matrix.md`
- `real_cutover_runbook.md`
- 当前会话记忆

若 SH-01～SH-09 全绿，新增一个脱敏的 `r0b_remediation_execution_record.md`；它只记录 commit、digest、计数、状态、审阅入口，不写私有绝对路径或真实 JSON。

## 7. 严禁修改/提交

- `apps/server/prisma/schema.prisma`
- `apps/server/prisma/migrations/**`
- G1 trigger/constraint 生成源（除非发现本契约本身错误并先停止请求决策）
- `workspace/projects/**` 到 Git；真实恢复文件仍受 gitignore 管理
- 默认 Keychain、真实 credential、AUTH、C0～C7 artifact
- 当前工作树中与本任务无关的用户文档和图片改动

## 8. 提交边界

推荐两次提交：

1. `fix(migration): resolve legacy character references in shadow import`
   - helper、Story/Storyboard/full order、自动化测试、施工包必要同步。
2. `docs(migration): record R0-B remediation shadow evidence`
   - 仅在执行完成后记录脱敏 digest/状态。

release worktree 和私有 plan 必须绑定第 1 个提交或包含第 1 个提交且代码完全相同的最终 remediation commit；第 2 个纯文档提交不改变已冻结 release appCommit。
