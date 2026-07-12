---
doc_id: AIR-G2-CONSTRUCTION-CODEMAP-001
status: accepted
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: ai-agent, developer, qa
source: G2 模块边界、当前 ProjectsModule 与 DB 垂直切片
---

# G2 施工包：文件、Repository 与事务地图

## 1. 目标

冻结 G2 的新增文件、现有文件改动、依赖方向、Repository 边界和事务所有权。实现者可以调整私有函数，但不得改变本文的模块职责和跨层依赖。

## 2. 总体依赖

```text
Controller
  -> ProjectsService（公共门面）
    -> 现有领域门面 ChapterScript/StoryStructure/Storyboard/ImagePreflight
      -> G2 command repository（每个正式命令一个事务）
        -> PrismaService / SQLite
      -> SourceSnapshotBuilder / NewWorkGate

ProjectsService query
  -> ChapterProductionQueryService
    -> ChapterVersionQueryRepository
    -> shared ChapterProductionStateResolver

PersistentTaskWorker（G1，后续接线）
  -> TaskApplicabilityGuard（G2）
    -> Story/Storyboard command repository 的 task completion 方法
```

禁止 `Controller -> Prisma`、`Web -> freshness 自算`、`worker -> 版本表直写`。

## 3. Shared 新增文件

目录：

```text
packages/shared/src/versioning/
```

| 文件 | 导出 | 职责 |
| --- | --- | --- |
| `canonical-json.ts` | `canonicalizeJcs`、`sha256Digest`、UTF-8 排序 helper | 唯一 JCS/摘要实现；不访问 DB/文件 |
| `document-contract.ts` | V2 Story/Storyboard/Preflight strict types、Version/WorkingCopy/Freshness enums | 唯一版本领域类型源 |
| `document-codec.ts` | `DocumentCodecRegistry`、四类 codec、V1→V2 显式转换 | normalize/validate/encode/digest |
| `source-snapshot.ts` | SourceSnapshot DTO、排序与 digest codec | 纯数据规则，不查询实体 |
| `production-state.ts` | `ChapterProductionStateResolver`、reason codes、workflow projection | 表驱动纯函数 |
| `api-contract.ts` | 本施工包 API request/response/history/page DTO | 不放业务实现 |
| `stable-shot-id.ts` | `deriveStableShotId` | 服务端和合同测试共享确定性算法；浏览器只传 requestId，不自行生成 Shot ID |
| `index.ts` | 上述公共导出 | 禁止循环导出 |

修改：

```text
packages/shared/src/index.ts
packages/shared/src/domain.ts
packages/shared/src/dto.ts
```

规则：

- 新 G2 类型从 `versioning/index.ts` 导出。
- `dto.ts/domain.ts` 的旧同义类型标记 deprecated 并引用新类型，不复制 enum。
- 不在 Shared 引入 Prisma/Nest/Node 文件系统。
- `canonical-json.ts` 可用 Web Crypto/纯 JS；若 Node `crypto` 只用于 server digest，则拆成注入 hash adapter，不能让 web build 引入 Node builtin。

## 4. Server 新增文件

目录：

```text
apps/server/src/projects/versioning/
```

### 4.1 基础设施

| 文件 | 职责 | 禁止 |
| --- | --- | --- |
| `versioning-database.types.ts` | Prisma transaction client、命令结果内部类型 | 暴露给 Controller |
| `version-transaction-runner.service.ts` | `$transaction`、SQLITE_BUSY/unique 最多 3 次全事务重试、错误归类 | 包含领域判断 |
| `g2-database-error.mapper.ts` | P2002、AIR_G2 trigger、条件更新 0 行映射稳定 HTTP code | 返回原始 SQL/secret |
| `chapter-version-query.repository.ts` | 一次读取 Chapter 与四层 current/pending/history 所需行 | 写业务行 |

### 4.2 Command Repository

| 文件 | 唯一事务所有权 |
| --- | --- |
| `script-version.repository.ts` | PATCH Working Copy、AI pending suggestion adopt/discard、revert、clear、publish、Script history |
| `story-version.repository.ts` | create/update/discard/confirm pending、Story projection、history、task result apply |
| `storyboard-version.repository.ts` | create/update/discard/confirm pending、Shot/projection、history、task result apply |
| `preflight-revision.repository.ts` | preview transaction read、confirm insert+pointer、history |

Repository 公共规则：

- 一个公开 command 方法包含完整 transaction；Service 不在 transaction 外拼多次写入。
- 接收 expected ID/digest/rowVersion，条件更新为 0 立即冲突。
- 只返回领域结果，不返回 Prisma model 给 Web。
- 事务内不调用 provider、文件读取、图片探测、网络或 Workspace 写入。
- 所有投影在 parent pending 时重建，formalize 后不再修改。

### 4.3 深模块

| 文件 | 实现模块 | 输入/输出 |
| --- | --- | --- |
| `source-snapshot-builder.service.ts` | `SourceSnapshotBuilder` | tx client + consumer + scope → typed snapshot/digest |
| `chapter-production-query.service.ts` | 查询编排 | DB rows → resolver input → ProductionState/Workflow DTO |
| `new-work-gate.service.ts` | `NewWorkGate` | tx client + operation/scope → allow/reasons |
| `task-applicability-guard.service.ts` | `TaskApplicabilityGuard` | task/claim/target/source → current/historical + fenced apply |
| `version-history.service.ts` | 四层 history list/detail/copy-to-pending | 只读查询 + 调用对应 repository 创建 pending |
| `stable-shot-id.service.ts` | requestId 校验与 `deriveStableShotId` 调用 | 不在内存保存映射 |

`ChapterProductionStateResolver` 和 `DocumentCodecRegistry` 的核心是 Shared 纯逻辑；Server 只负责获取真实输入。

## 5. 现有 Server 文件改动

| 文件 | 改动 |
| --- | --- |
| `projects.module.ts` | 注册 query/repository/deep modules；不新增第二个 ProjectsModule |
| `projects.controller.ts` | 按 API 施工契约增加路由；旧路由兼容行为显式处理 |
| `projects.service.ts` | 保持公共门面，委托新 command/query；不吸收事务 SQL |
| `chapter-script.service.ts` | file mode 保留旧 adapter；B1 先由 `ScriptVersionService -> ScriptVersionRepository` 承接新 DB-only API，旧 G1 路径待 capability switch 后再委托/关闭 |
| `story-structure.service.ts` | db mode 委托 StoryVersionRepository；角色回填在 codec 前完成 |
| `storyboard.service.ts` | db mode 委托 StoryboardVersionRepository；删除“编辑即清候选/布局”行为 |
| `image-preflight.service.ts` | db mode 使用 SourceSnapshotBuilder/PreflightRepository |
| `project-repository.service.ts` | 仅移除 DB readback 对 G2 指针的 fail-closed，改由 query service组装；不得新增 G2 transaction 方法 |
| `workflow.util.ts` | 旧 file-mode 兼容；db/G2 消费 server production state，不再按 updatedAt 自算 |
| `tasks.service.ts` | G1 persistent worker 未接线前不在 G2 切片重写；只允许接 NewWorkGate create adapter |
| `persistence/g1-runtime-migration-ledger.ts` | 增加 G2 capability 下的 0009 ledger 验证，不改 G1 历史常量语义 |

## 6. Migration/合同文件

新增：

```text
apps/server/prisma/migrations/0009_g2_version_freshness_overlay/migration.sql
apps/server/src/persistence/g2-overlay-contract.ts
apps/server/src/persistence/g2-overlay-contract.spec.ts
```

`g2-overlay-contract.ts` 只包含：migration 名、2 index、14 trigger 的名称/normalized SQL 和直接验证函数。不得创建 generate/write CLI、review bundle、签名或 CAS 流程。

## 7. 前端改动地图

| 文件 | 改动 |
| --- | --- |
| `apps/web/src/services/api.ts` | 新 API methods 和 ApiEnvelope 类型 |
| `apps/web/src/stores/workbench-store.ts` | 保存 expected rowVersion/digest；409 后拉 production state；不盲重试 |
| `utils/workbench-workflow.ts` | 降级为 DTO 展示 helper，删除 freshness 业务推导 |
| `utils/workbench-preflight.ts` | 仅保留 UI 格式化；ready/source reason 使用 server DTO |
| `ScriptDocumentEditor.vue` | dirty/clean、发布、还原、清空和冲突提示 |
| `StoryStructureWorkspace.vue` | pending CRUD/confirm/history；409 刷新 |
| `StoryboardWorkspace.vue` | stable Shot create requestId、pending CRUD/confirm/history |
| `ImagePreflightWorkspace.vue` | preview/confirm、source changed、history |
| `WorkflowStrip.vue`、`WorkbenchStageRail.vue` | 展示 needs_confirmation/needs_update/reasonCodes |

前端不得：

- 根据 `updatedAt` 推导 stale。
- 修改 confirmed history。
- 冲突后用本地 payload 自动覆盖。
- 自行生成最终 Shot ID。

## 8. 事务所有权与顺序

### 8.1 Script PATCH

Owner：`ScriptVersionRepository.updateWorkingCopy`

```text
read Chapter by scope
-> compare expectedChapterRowVersion
-> normalize ScriptText + digest
-> conditional UPDATE Chapter working fields + rowVersion+1
-> return Chapter + productionState query input
```

### 8.2 Script publish

Owner：`ScriptVersionRepository.publish`

```text
read Chapter/current Script/pending Story
-> compare expected current/working digest/chapter rowVersion
-> reject empty
-> allocate version
-> INSERT immutable ChapterScriptVersion
-> archive incompatible pending Story + clear pointer
-> UPDATE Chapter current Script/working clean/milestone/rowVersion+1
-> return committed version + state
```

confirmed Story/Board/Preflight 和历史产物不更新。

AI 生成的 `ChapterScriptPending` 不是 ScriptVersion。采用操作由同一 Repository 在一个事务中校验 pending rowVersion，把内容规范化写入 Chapter Working Copy、删除 pending 并令 Chapter rowVersion+1；丢弃只删除 pending。两者都不创建正式 ScriptVersion。

### 8.3 Story create/update/discard

Owner：`StoryVersionRepository`

- create：若 active pending 已存在且 based current/source 与请求一致，幂等返回；不一致返回 409。
- update：条件 `id + rowVersion + active pointer`；codec/角色解析完成后写 document/digest，rowVersion+1。
- discard：条件命中后 pending→archived、清 pointer、Chapter rowVersion+1。

### 8.4 Story confirm

Owner：`StoryVersionRepository.confirm`

```text
read Chapter/current Script/current Story/pending Story/pending Board
-> expected + NewWorkGate
-> strict normalize + character resolution + digest
-> rebuild Story projections while parent pending
-> pending status confirmed with rowVersion+1
-> switch current Story + clear pending Story
-> archive incompatible pending Board + clear pending Board
-> Chapter rowVersion+1
```

### 8.5 Storyboard confirm

Owner：`StoryboardVersionRepository.confirm`

```text
read Chapter/current Story/current Board/pending Board
-> expected + NewWorkGate
-> strict normalize + validate stable Shot IDs
-> INSERT newly derived Shots; mark removed current Shots retired
-> rebuild projections while parent pending
-> pending status confirmed with rowVersion+1
-> switch current Board + clear pending Board
-> Chapter rowVersion+1
```

不修改 Preflight/Candidate/Layout/Export。

### 8.6 Preflight confirm

Owner：`PreflightRevisionRepository.confirm`

```text
outside tx: build preview and perform file/image probes
inside tx: rebuild SourceSnapshot from DB rows
-> compare expectedSourceDigest + expected current IDs + Chapter rowVersion
-> allocate version
-> INSERT immutable PreflightRevision V2
-> switch Chapter.currentPreflightRevisionId + rowVersion+1
```

### 8.7 Task completion

Owner：对应 Story/Storyboard repository 的 `applyTaskResult`，由 `TaskApplicabilityGuard` 调用。

```text
same tx:
  verify task + open Attempt + claimToken
  recompute source + active pending + target rowVersion
  if current: conditional write pending + rowVersion+1
  if mismatch: do not write pending/current
  finish Attempt
  mark Task succeeded + applicability current/historical
```

## 9. DB/File 双模式边界

- `file` mode 保留现有旧 API 行为，作为迁移前兼容；不写 SQLite 业务表。
- `db` mode 的 G2 新 API 只写 SQLite，不写 `script.md/structure.json/storyboard.json/preflight.json`。
- DB mode 禁止通过 `ProjectStore` 旁路写版本事实。
- UI 切换到 G2 新 API 必须与 DB/G2 capability 同一发布单元；旧写 API 在 DB mode 的行为见 API 施工契约。
- 不做 DB+file 双写，也不从 DB 写回旧文件作为“备份”。

## 10. 文件级切片允许范围

| 切片 | 允许主要目录 |
| --- | --- |
| G2-A0 | `packages/shared/src/versioning` + shared specs |
| G2-A1 | `apps/server/src/persistence`、0009、`projects/versioning` 基础文件 |
| G2-B | Script facade/controller/shared API/web Script 组件 + Script repo tests |
| G2-C1 | Story facade/repo/projection/API/web Story 组件 |
| G2-D1 | Board facade/repo/Shot/API/web Board 组件 |
| G2-E | Preflight/query/workflow/gate/API/web workflow/preflight |
| G2-F | test support/E2E/evidence docs，不再扩业务范围 |

任何切片修改不在表内的核心模块，必须在 progress 中说明必要性和回归范围。

## 11. 大文件限制

- 不得继续把 G2 事务加入当前 `ProjectRepository`。
- `ProjectsService` 只做门面委托，不保存 G2 状态。
- 任一新源文件超过约 600 行时，应先按 command/query/codec 分责；测试 fixture 数据可例外但需说明。
- 不复制 a/b 两份 DSL helper；G2 overlay 只有一个直接合同定义源。
