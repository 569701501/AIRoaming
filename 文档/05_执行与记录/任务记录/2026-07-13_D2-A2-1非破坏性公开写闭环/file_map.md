---
doc_id: AIR-D2-A2-1-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-1 实施契约、当前 projects/versioning/web 代码结构
---

# D2-A2-1 文件与函数地图

## 1. 新增文件

| 文件 | 必须职责 | 禁止塞入 |
| --- | --- | --- |
| `apps/server/src/projects/project-script-command.repository.ts` | metadata、ensure chapter、AI pending/revision、outline draft/confirm 的 DB 事务命令 | workspace IO、HTTP、Web DTO 拼装、A2-2 clear/import/reset |
| `apps/server/src/projects/project-script-command.repository.spec.ts` | deterministic fake/Prisma transaction 单测、重放/冲突/回滚 | 直接把 mock 通过当公开 DB 证据 |
| `apps/server/src/projects/versioning/runtime-command-id.ts` | 从明确 command identity 生成稳定 runtime ID | migration sourceKey、真实 secret、时间戳、随机数 |
| `apps/server/src/projects/versioning/runtime-command-id.spec.ts` | 稳定性、分隔歧义、不同 scope 不碰撞的单测 | importer 逻辑 |

如果实现者能在不扩大 `project-script-command.repository.ts` 的前提下把 ID helper 作为同文件私有函数，后两个文件可合并；但 helper 仍必须有独立测试。

## 2. Server 必改文件

| 文件 | 函数/区域 | 修改要求 |
| --- | --- | --- |
| `apps/server/src/projects/projects.module.ts` | providers | 注册 `ProjectScriptCommandRepository`；不新增循环依赖 |
| `apps/server/src/projects/projects.service.ts` | constructor | 注入 command repository 或通过 `ChapterScriptService` 委托；不要让 controller 直写 Prisma |
| 同上 | `updateProjectDraft()` | DB 分支只写 metadata；显式 `sourceText` 返回 legacy disabled；file 分支原行为不变 |
| 同上 | `saveChapterDraft()/completeChapter()/confirmChapterPendingSource()/discardChapterPendingSource()` | DB 模式旧入口稳定 409 + replacement；file mode 原行为不变 |
| 同上 | `writeChapterDraftFromAI()/ensureChapterExists()/saveScriptOutlineFromAI()/confirmScriptOutline()` | DB 分支走 command repository；保留 D2-A0 操作调用点；confirm 增加 expected outline ID |
| 同上 | `getWorkbenchSnapshot()` | 增加真实 `versioningCapability`；不得按表存在猜 mode |
| `apps/server/src/projects/chapter-script.service.ts` | 同名 4 个方法 | 保留 file-mode 业务；DB 逻辑委托到 command repository，返回值从 refresh 后 LocalProject 组装 |
| 同上 | `applyChapterPendingSource()` | file mode 保持覆盖单 pending；不要复用它做 DB whole-tree write |
| `apps/server/src/projects/project-repository.service.ts` | `loadProjectsFromDatabase()` 附近 | 抽出可复用单项目 DB read，并新增 `refreshProjectFromDatabase(projectId)` |
| 同上 | `databasePendingSourceToLocal()/databaseRevisionToLocal()` | nullable provenance 原样投影，不再用空字符串冒充 |
| `apps/server/src/projects/versioning/script-version.service.ts` | mutation 方法 | 成功后刷新目标 project identity map；read 方法不刷新 |
| `apps/server/src/projects/versioning/script-version.repository.ts` | pending adopt/discard 等 | 只做契约需要的最小修正；不得在 adopt 创建 ScriptVersion；保持现有 CAS |
| `apps/server/src/projects/versioning/g2-database-error.mapper.ts` | error union/mapping | 新增 `PROJECT_NOT_FOUND`；legacy disabled 走统一 error body；未知 SQL 不泄漏 |
| `apps/server/src/projects/projects.controller.ts` | 旧/new Script routes | 保持 G2 新路由 DTO；确认旧路由错误由统一 filter 映射；不得在 controller 读取最新 CAS 后写 |
| `apps/server/src/dialogue/script-dialogue.service.ts` | outline confirm 两处 | 传入用户看到的 `outline.id` |
| 同上 | `createGenerateMultipleChaptersToolResult()` | 每章派生稳定 child toolCallId，避免 revision unique 冲突 |

### 2.1 推荐刷新调用形态

不要让 controller 自己“写完再 reload”。刷新属于应用服务的一致性责任：

```text
Controller
  -> ProjectsService / ScriptVersionService
    -> DB command transaction
      -> ProjectRepository.refreshProjectFromDatabase(projectId)
        -> 组装/返回 DTO
```
这样 Service integration 和 HTTP 都覆盖同一条真实路径。

## 3. Shared 必改文件

| 文件 | 修改要求 |
| --- | --- |
| `packages/shared/src/dto.ts` | 定义/导出 `VersioningCapability`，给 `WorkbenchSnapshot` 增加 `versioningCapability`；把 DB 可缺失的 revision/pending provenance 字段改为 nullable，禁止空字符串 sentinel |
| `packages/shared/src/versioning/api-contract.ts` | 复用现有 Script Working/Pending/Publish DTO；除非契约缺字段，不新建第二套同义 DTO |
| `packages/shared/src/index.ts` 或现有 barrel | 确认新增类型从 `@airoaming/shared` 可导入 |
| `packages/shared/src/**/*.spec.ts` | capability shape、nullable provenance 或纯 CAS request builder 的单测；具体位置服从现有模块结构 |

不要把 DB mode 判断写进 shared；shared 只放类型和纯函数。

## 4. Web 必改文件

| 文件 | 函数/区域 | 修改要求 |
| --- | --- | --- |
| `apps/web/src/services/api.ts` | project API object | 增加 get/update/clear/revert Working Copy、publish、get/adopt/discard pending、history（若 UI 已需）方法；请求体直接使用 shared DTO |
| `apps/web/src/stores/workbench-store.ts` | state | 增加 `scriptWorkingCopy`、`scriptPendingSuggestion`；切 project/chapter 时清空旧 scope 状态 |
| 同上 | load/refresh | 先得到 snapshot/mode；仅 DB mode 读取 G2 Working/pending；结果必须校验 chapterId 与 active scope |
| 同上 | `saveChapterDraft()` | file mode 旧调用；DB mode 用已观察 rowVersion PATCH Working Copy，不得 click-time pre-read 绕过冲突 |
| 同上 | `completeChapter()` | DB mode必要时先更新 Working，再 publish；使用上一步 response 的 digest/rowVersion |
| 同上 | `confirmChapterPendingSource()/discardChapterPendingSource()` | DB mode改用 modern pending DTO + CAS；file mode 保留旧 API |
| 同上 | clear/reset 相关 action | DB mode当前只把“清空本章工作稿”接到 Working Copy clear；整项目 reset 继续禁用/显示不可用，不调用 A2-2 |
| `apps/web/src/components/workbench/ScriptDocumentEditor.vue` | editor 初始值/按钮 | DB mode显示 Working Copy 与 modern pending；冲突消息清楚；不从旧 snapshot 猜 rowVersion |
| `apps/web/src/components/workbench/ProjectWorkbenchView.vue` | props/events | 将 store 的 modern script state 传给 editor；file mode兼容原 snapshot |
| `apps/web/src/components/layout/AppShell.vue` | action handler | action 名可保留，但必须走 store 的 mode branch；AI 消息完成后刷新当前 script runtime state |

如果可以只修改 store/API 而不改变组件公开 props，优先最小 diff；但不得继续让 DB mode UI 读取旧 `pendingSourceText` 作为 CAS 事实源。

## 5. 测试必改/新增文件

| 文件 | 证据 |
| --- | --- |
| `apps/server/src/projects/project-script-command.repository.spec.ts` | metadata/ensure/pending/outline 的 unit + transaction contract |
| `apps/server/src/projects/project-db-persistence.integration.spec.ts` | fresh SQLite 主链、同进程 cache、restart、workspace isolation、并发/replay |
| `apps/server/src/projects/projects.service.source-guard.spec.ts` | 新 DB 分支仍保留 operation inventory；file-mode guard 回归 |
| `apps/server/src/migration/db-capability-registry.spec.ts` | 5 operation evidence、其他 operation/capability 不变、blockedIds=6 |
| `apps/server/src/projects/projects.legacy-write.integration.spec.ts`（建议新增） | 四条旧 HTTP route 在 DB 409 + replacement、file mode 原行为；如果合并进既有集成 spec，test ID 仍必须稳定 |
| `packages/shared/src/versioning/*spec.ts` | mode/CAS 请求纯逻辑（如抽 helper） |
| 现有 Web/Playwright 测试或 Runtime Review | WEB-01～03；没有 Web unit runner时不得伪称 unit test，至少保留可复现临时根人工/浏览器证据 |

## 6. capability 与文档必改文件

| 文件 | 修改要求 |
| --- | --- |
| `apps/server/src/migration/db-capability-registry.ts` | 只更新 5 个 operation 的状态/evidence；两个聚合项保持 partial；blockedIds 不降 |
| `文档/05_执行与记录/任务记录/2026-07-13_D2-A2-1非破坏性公开写闭环/progress.md` | 每个里程碑记录改动、命令与结果 |
| 同目录 `findings.md` | 记录事实、风险、与契约偏差；不能只写“完成” |
| 同目录 `scrutiny_review.md` | 独立静态复核结论 |
| 同目录 `runtime_review.md` | 临时根用户路径、restart/isolation 结论 |
| `文档/05_执行与记录/功能完成记录/2026-07-13_D2-A2-1非破坏性公开写闭环.md` | 仅所有复核通过后新增；不得提前创建完成记录 |

## 7. 禁止修改清单

除非停止并重新申请设计授权，不得修改：

```text
apps/server/prisma/schema.prisma
apps/server/prisma/migrations/0001～0010/**
apps/server/src/persistence/g1-*-source.ts
apps/server/src/persistence/g1-schema-manifest*.ts
Story/Storyboard/Preflight repositories
Character/Asset/Candidate/Layout/Export repositories
Project delete/Outbox/final importer/M6 activate 实现
```

## 8. 推荐实现顺序

```text
runtime-command-id + tests
  -> ProjectScriptCommandRepository + tests
    -> ProjectRepository single-project refresh
      -> Projects/ChapterScript service DB branch
        -> ScriptVersionService cache refresh
          -> WorkbenchSnapshot capability
            -> Web API/store dual-mode cutover
              -> legacy route stable rejection
                -> fresh SQLite full path
                  -> capability evidence
```
