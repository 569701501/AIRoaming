---
doc_id: AIR-D2-A2-1-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-1 Handoff、G2 API 与幂等契约、当前 Prisma schema 与 trigger
---

# D2-A2-1 实施契约

## 1. 总体实现形态

新增一个面向本切片的深模块 `ProjectScriptCommandRepository`，只负责下列 DB 命令：

```ts
interface ProjectScriptCommandRepository {
  updateProjectMetadata(projectId: string, input: ProjectMetadataPatch): Promise<void>;
  ensureChapter(projectId: string, order: number, title?: string): Promise<void>;
  createAiPendingSuggestion(
    projectId: string,
    chapterId: string,
    input: WriteChapterDraftFromAIInput,
  ): Promise<{ pendingId: string; revisionId: string; replayed: boolean }>;
  saveScriptOutline(
    projectId: string,
    input: SaveScriptOutlineFromAIInput,
  ): Promise<{ outlineId: string; replayed: boolean }>;
  confirmScriptOutline(
    projectId: string,
    expectedOutlineId: string,
  ): Promise<{ outlineId: string; replayed: boolean }>;
}
```

方法名可在实现时做小幅调整，但职责和事务边界不得改变。

强制结构规则：

- DB 命令直接写 Prisma 表，不使用整棵 `LocalProject` diff 猜变化。
- 所有多表命令使用现有 `VersionTransactionRunner`。
- runtime 稳定 ID helper 放在 projects/versioning 边界，不得依赖 migration importer 或 `PrismaMigrationLedgerRepository`。
- file mode 继续走当前 `ChapterScriptService` / `ProjectStore` 行为。
- DB 提交后调用 `ProjectRepository.refreshProjectFromDatabase(projectId)`，刷新 identity map；不得用进程重启掩盖缓存不一致。
- `refreshProjectFromDatabase()` 只读 DB，不扫描 workspace；只替换目标 project 的缓存项。

## 2. 模式能力契约

按已批准的 G2 契约，在 `WorkbenchSnapshot` 增加：

```ts
interface VersioningCapability {
  mode: "legacy_file" | "g2_db";
  schemaVersion: 2;
  supports: {
    scriptWorkingCopy: boolean;
    storyWorkingCopy: boolean;
    storyboardWorkingCopy: boolean;
    preflightRevision: boolean;
    persistentTaskRuntime: boolean;
    importer: boolean;
  };
}

interface WorkbenchSnapshot {
  versioningCapability: VersioningCapability;
  // existing fields unchanged
}
```

规则：

- `mode` 必须来自 `PrismaService.mode` / 真实 persistence runtime，不能根据数据库表存在与否猜测。
- `legacy_file` 时 6 个 support flag 全为 `false`，Web 继续调用旧 file-mode API。
- `g2_db` 时当前已接线的 `scriptWorkingCopy/storyWorkingCopy/storyboardWorkingCopy/preflightRevision/persistentTaskRuntime` 为 `true`，Web 的 Script 区域必须调用 G2 新 API。
- `importer` 在 full final importer 接线前固定为 `false`。
- 本切片直接验收 `mode` 和 `scriptWorkingCopy`，同时用快照测试锁定其余 flag，禁止为了本切片随意改值。
- G2 新 mutation 在 file mode 继续返回 `409 G2_DB_MODE_REQUIRED`；前端能力分支不能代替服务端保护。

## 3. 项目 metadata 命令

### 3.1 允许字段

DB 模式 `PATCH /projects/:projectId` 只允许更新：

```text
name
storyTitle
genreTags
artStyle
description
```

继续复用 `parseUpdateProjectDraftRequestV1()` 的 unknown-field、空白规范化、`comicFormat` immutable 校验。

### 3.2 `sourceText` 边界

只要请求对象显式包含 `sourceText`，DB 模式就返回：

```json
{
  "success": false,
  "error": {
    "code": "LEGACY_WRITE_ROUTE_DISABLED",
    "details": {
      "replacement": "/api/projects/{projectId}/chapters/{currentChapterId}/script/working-copy"
    }
  }
}
```

不得因为值为空、与当前相同或服务端刚读到最新 rowVersion 就偷偷写入 Script Working Copy。file mode 行为保持不变。

### 3.3 事务与重放

- 项目不存在：`404 PROJECT_NOT_FOUND`。
- 空 patch：返回当前 DTO，不增加 `Project.rowVersion`。
- 所有字段与当前值相同：语义重放，不增加 rowVersion。
- 有变化：事务内按当前 `Project.rowVersion` 做 updateMany CAS，成功后 `rowVersion+1`。
- 不修改 `comicFormat`、`lifecycleStatus`、current pointers、Chapter 或任何 workspace 文件。

## 4. `ensure_chapter_exists` 命令

输入规则：

- `order` 必须是正整数；非法输入返回 `400 VERSION_DOCUMENT_INVALID`，details 至少含 `field=order`。
- 已存在相同 `(projectId, order)`：返回原章，`replayed=true`；不得顺便改 title、current pointer 或 rowVersion。
- 不存在时创建：

```text
id                  = {projectId}_chapter_{order.padStart(3, "0")}
slug                = chapter-{order.padStart(3, "0")}
title               = trim(input.title) || 第 {order} 章
milestoneStatus     = draft
scriptWorkingText   = ""
scriptWorkingDigest = encodeScriptTextV1("", { allowEmpty: true }).digest
scriptWorkingState  = empty
rowVersion          = 0
```

- 创建 Chapter 与更新 `Project.currentChapterId`、`Project.rowVersion+1` 必须同事务。
- 两个并发相同 order 请求最终只能有一行；输家按已达成目标返回 replay，不得报 500。
- 不创建 workspace 目录，不删除/改写其他章节，不重新编号。

## 5. AI Chapter pending 命令

### 5.1 正规化与权威边界

- 继续执行 `stripChapterScriptName()`；空正文返回 `400 AI_CHAPTER_DRAFT_REQUIRED` 或映射后的稳定 400。
- 使用 `encodeScriptTextV1()` 规范化换行并计算 digest；最大 2 MiB。
- `ChapterScriptPending` 是唯一权威待采用稿。
- 创建 pending 时不得修改：
  - `Chapter.scriptWorkingText/digest/state`
  - `Chapter.currentScriptVersionId`
  - 任一 `ChapterScriptVersion`
  - Story/Storyboard/Preflight/Layout/Export 历史
  - `Chapter.title` 和 `Chapter.summary`
- `input.title` 只是当前兼容调用的提示，不得在用户采用正文前单独改变正式 Chapter metadata。

### 5.2 命令身份与重放

稳定命令身份至少绑定：

```text
projectId + chapterId + threadId + toolCallId + operation
```

由该身份确定性派生 pending ID 与 revision ID；算法必须有 unit test，且不能调用 migration ledger helper。

事务行为：

1. 校验 Project active、Chapter scope 正确。
2. 若确定性 pending 已存在且 scope/operation/digest 全相等，返回同一 pending/revision，`replayed=true`。
3. 若同一命令身份已存在但 digest 或 operation 不同，返回 `409 PENDING_VERSION_CONFLICT`。
4. 若该 Chapter 已有另一个 active pending，返回 `409 ACTIVE_PENDING_EXISTS`，不得覆盖。
5. 首次成功时同事务创建 `ChapterScriptPending`、`ChapterScriptRevision`，再把 `Chapter.lastScriptRevisionId` 指向该 revision 并令 Chapter `rowVersion+1`。

revision 规则：

- `source="ai_tool"`。
- `targetWorkingDigest` 等于“若采用该 pending 后的目标 Working Copy digest”，即 pending digest。
- `summary` 保存 `input.summary`；不得保存 secret 或 provider 原始响应。
- `toolCallId` 必须持久化。
- D2-A5 前 runtime Conversation 行可能不存在；只有已存在且 scope 正确时才写 `threadId/messageId` FK，否则写 `null`，不得伪造 Conversation 行或空字符串 ID。
- Shared 兼容 DTO 中对应 provenance 字段应允许 `null`；DB projection 不得用 `""` 冒充缺失 ID。

当前批量生成复用一个 root `toolCallId`。为兼容 `ChapterScriptRevision(threadId, toolCallId)` unique，批量调用每章必须派生稳定 child tool ID，例如：

```text
{rootToolCallId}:chapter:{order}
```

### 5.3 采用与丢弃

复用现有 G2 `ScriptVersionRepository`：

- adopt：CAS 校验 pending + Chapter rowVersion；删除 pending；只写 Working Copy；不创建 ScriptVersion。
- discard：CAS 校验 pending；删除 pending；Working Copy/current/history 不变；revision 作为已发生 AI 建议的审计记录保留。
- 只有 `POST .../script/publish` 可以创建新的 `ChapterScriptVersion`。

## 6. Project Script Outline 命令

### 6.1 保存 draft

- `sourceText` trim 后非空，按 UTF-8 正规化并计算 SHA-256 digest。
- 稳定命令身份绑定 `projectId + threadId + toolCallId`，确定性派生 outline ID。
- 同命令、同 digest：返回原 outline，replay，不新增版本。
- 同命令、不同 digest：`409 PENDING_VERSION_CONFLICT`。
- 不同命令但当前 draft digest 相同：允许返回当前 draft 作为语义重放，不制造重复内容版本。
- 新内容：`version=max(project.version)+1`，新增 `status=draft` 行，并把 `Project.currentScriptOutlineId` 指向新行；不得覆盖旧 confirmed/archived 正文。
- 旧的非 current draft 可以作为历史证据保留；读取必须只信 current pointer，不得按“最新 updatedAt”替代指针。
- 可同步更新 `Project.storyTitle` 为解析到的 outline title，并令 Project `rowVersion+1`；outline insert、pointer、storyTitle 必须同事务。

### 6.2 确认

将签名改为显式 expected ID：

```ts
confirmScriptOutline(projectId: string, expectedOutlineId: string)
```

所有调用方必须传入用户实际看到并确认的 `outline.id`，禁止服务端读取“当前最新 outline”后静默确认。

- expected row 不存在或 scope 错：`404 VERSION_NOT_FOUND`。
- `Project.currentScriptOutlineId !== expectedOutlineId`：`409 CURRENT_VERSION_CHANGED`。
- expected 已是 current confirmed：返回 replay。
- expected 是 current draft：同事务把先前 confirmed outline 改为 archived（只改变允许的 lifecycle 字段）、把 expected 改为 confirmed 并写 `confirmedAt`。
- confirmed/archived 的 title、sourceText、sourceDigest、version、createdAt 不得改写或删除。

## 7. G2 Web 与旧路由契约

### 7.1 Web 双模式

Web 必须按 `snapshot.versioningCapability.mode` 分支：

| 动作 | `legacy_file` | `g2_db` |
| --- | --- | --- |
| 保存正文 | 旧 `PATCH .../draft` | `PATCH .../script/working-copy` |
| 清空正文 | 旧 `POST .../script/clear` | `DELETE .../script/working-copy` |
| 完成本章 | 旧 `POST .../complete` | 必要时先 PATCH Working Copy，再 `POST .../script/publish` |
| 采用 AI 稿 | 旧 `POST .../source-pending/confirm` | `POST .../script/pending-suggestion/adopt` |
| 丢弃 AI 稿 | 旧 `DELETE .../source-pending` | `DELETE .../script/pending-suggestion` |

Web store 至少维护：

```ts
scriptWorkingCopy: ScriptWorkingCopyDto | null;
scriptPendingSuggestion: ScriptPendingSuggestionDto | null;
```

- 进入/切换 Chapter 时读取 Working Copy 和 pending；file mode 不调用这些 DB-only API。
- expected rowVersion/digest/ID 必须来自用户开始编辑时已加载的 DTO。
- 禁止点击保存时先读取“最新值”，再用最新值替用户提交；这会绕过双客户端冲突保护。
- 409 冲突时不自动重试，不覆盖；重新读取并显示“内容已在别处更新，请确认后重试”。
- AI 对话产生 pending 后，刷新当前 Chapter 的 Working Copy + pending 状态。

### 7.2 DB 模式旧路由

以下旧写入口在 DB 模式稳定返回 `409 LEGACY_WRITE_ROUTE_DISABLED`：

| 旧入口 | replacement |
| --- | --- |
| `PATCH .../draft` | `.../script/working-copy` |
| `POST .../complete` | `.../script/publish` |
| `POST .../source-pending/confirm` | `.../script/pending-suggestion/adopt` |
| `DELETE .../source-pending` | `.../script/pending-suggestion` |

要求：

- error body 使用现有 G2 统一结构，details 含 replacement。
- DB 零写入。
- file mode 旧行为与现有测试保持一致。
- `script/clear`、project reset 和 import 仍属于 A2-2；本切片不宣称旧 clear/reset/import 已闭合。

## 8. identity map 一致性

新增：

```ts
ProjectRepository.refreshProjectFromDatabase(projectId: string): Promise<void>
```

至少在以下成功 mutation 后调用：

- 本切片 5 个 DB command。
- G2 Script Working Copy update/clear/revert。
- Script publish。
- pending adopt/discard。
- history copy-to-working-copy。

验收顺序必须证明：

```text
DB mutation
  -> 同一 Nest 进程 ProjectsService.getWorkbenchSnapshot()
  -> app.close/reopen
  -> 再次 getWorkbenchSnapshot()
```

三处语义一致。刷新失败不得回滚已提交事务；上层返回失败后重试必须由命令幂等/CAS 安全处理。

## 9. 错误与事务契约

新增 `PROJECT_NOT_FOUND` 到 G2 error code union，映射 404。其余优先复用：

```text
VERSION_DOCUMENT_INVALID
VERSION_NOT_FOUND
CURRENT_VERSION_CHANGED
PENDING_VERSION_CONFLICT
ACTIVE_PENDING_EXISTS
CHAPTER_VERSION_CONFLICT
LEGACY_WRITE_ROUTE_DISABLED
G2_DATABASE_CONTRACT_VIOLATION
```

所有 Prisma/trigger 未知错误必须映射为 500 contract violation，不得把 SQL、绝对路径、正文或 provider 文本回显给客户端。

## 10. capability 登记契约

只有以下操作在证据全部通过后改为 `writeStatus=implemented` 并绑定稳定 test ID：

```text
update_project_draft
ensure_chapter_exists
write_chapter_draft_from_ai
save_script_outline_from_ai
confirm_script_outline
```

为保持 D2-A0 的源码覆盖清单，DB 分支可以在 gate 前返回，file 分支保留原 `assertDatabaseOperationSupported("...")` 调用点；不得通过删除登记项绕过扫描。

本切片结束时必须满足：

- `project_chapter_script.writeStatus=partial`。
- `outline_story_storyboard_preflight.writeStatus=partial`。
- 两者 `restartCovered` 只能按已有真实证据设置；不得提前写成整体完成。
- `blockedIds` 仍精确为 6。
- 其他 capability 和 operation 状态逐项不变。

## 11. schema 与文件不变量

- 0001～0010 migration、`schema.prisma`、G1 source/manifest 字节不变。
- DB 模式不创建 `workspace/projects/{projectId}`。
- 测试在旧 workspace 放入同 ID 的伪 `project.json`、chapter metadata、`script.pending.md`、`script-outline.md` 后，同进程和重启 DTO 必须仍来自 DB。
- 不允许真实 provider 调用；AI pending 测试直接调用 service/repository，或使用 deterministic fake provider。
