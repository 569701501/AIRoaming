---
doc_id: AIR-SOLUTION-20260711-G2-UPSTREAM-FRESHNESS
status: active
created: 2026-07-11
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户继续规划与确认、七阶段能力缺口、G1开发级文档、ADR-0010/0012、现有代码审计
---

# G2 上游版本链与 Freshness 开发方案

## 1. 结论

G2 不重建七阶段，也不增加一套可写“过期状态表”。它只修复前四层正式输入：

```text
ScriptVersion
  -> StoryVersion
  -> StoryboardVersion
  -> PreflightRevision
```

正式方案是：

1. 每一层都区分可变 Working Copy 与用户确认后的不可变正式版本。
2. 当前正式版本通过 Chapter current 指针表达，不通过覆盖旧行表达。
3. 下游保存规范化来源快照；freshness 从 current 指针、来源 ID 和摘要实时派生。
4. Working Copy 存在时，旧正式链和旧导出仍可查看，但禁止创建新的正式下游任务。
5. 新上游正式发布后，旧下游保留并显示“来源已更新”，不清空、不覆盖、不倒退里程碑。
6. 运行任务只对启动时来源负责；来源变化后，迟到结果不能更新 current 或 active pending。

G2 完成后，用户看到的是三个简单结果语言：

- **有未确认修改：** 当前改动尚未影响旧成品，需要确认或放弃。
- **来源已更新：** 上游新版本已经生效，本步骤需要基于新来源更新。
- **历史版本：** 旧版本和旧导出仍可查看，但不再代表当前制作链。

本方案已获用户确认并由 ADR-0013 采纳。2026-07-12 的正式 migration tree 与 C3 Project/Chapter/Script 最小 DB substrate 已满足 G2 开发起点；G2 主体尚未实现，完成仍须本方案自己的发布事务、rowVersion/CAS、并发、隔离与 freshness 证据。允许开始 G2 开发不代表 G1 全量完成或 production DB-only cutover。

2026-07-12 已补充五份正式施工资料，冻结依赖门禁、`0009` overlay、文件/事务 seam、完整 API/幂等和可执行测试计划。实施时不能只读本主方案后自由补细节；必须同时读取第 17 节列出的施工包，并按 `G2-A0/A1/B/C1/D1/E/F` 小切片交付。

## 2. 目标与非目标

### 2.1 目标

- 已完成章节允许安全返修剧本、剧情结构和分镜。
- 每次正式确认都生成可追溯版本，不修改旧正式内容。
- 阶段门禁准确区分“未确认修改”“正式来源已更新”“历史可查看”。
- `story_parse`、`shot_generate`、出图准备和候选任务使用相同来源校验协议。
- 旧数据迁移后不伪造缺失来源，不因不确定性删除历史。
- 为 G4 CandidateLockRevision 和 G5 LayoutRevision 提供同一种来源/freshness 词汇。

### 2.2 非目标

- 不实现 G1 全量数据库切换；G2 复用已通过隔离验证的正式 migration tree 与 C3 Project/Chapter/Script substrate 开发，生产切换仍由 G1 独立验收和授权。
- 不实现候选定稿影响预览、画布格子 stale 或 ExportRevision UI；它们属于 G4/G5。
- 不实现跨步骤自动推进、整章自动生产或 Prompt 质量系统。
- 不保存独立可写的 `freshness` 行或批量级联更新所有历史行。
- 不做任意历史版本合并、分支、三方 diff 或多人协作。
- 不把项目级漫画版式入口提前到 G2；G3 负责 D1。

## 3. 当前代码事实

### 3.1 剧本

`ChapterScriptService` 当前已有：

- `sourceText` 正式/工作正文混用；
- `pendingSourceText` 作为 AI 草稿缓冲；
- 完成本章时创建 `scriptVersions`；
- `currentScriptVersionId`。

但 `saveChapterDraft` 和 `confirmChapterPendingSource` 在章节已到后续阶段时只更新 `sourceText`。因此正文可能已经改变，而 current ScriptVersion、StoryVersion 和 workflow 仍指向旧事实。

### 3.2 剧情结构

首次确认会创建新 `ChapterStoryStructure`，但 `updateChapterStoryStructure` 会保留相同 ID/version 并原地改 `structureJson`。下游只看到相同 `sourceStoryVersionId`，无法识别结构内容变化。

当前 AI 待确认结构仍由 `pendingStoryStructures` 内存 Map 承载；G1 已规划迁入数据库。

### 3.3 分镜

分镜已有 `storyboard.pending.json`，但确认后的字段编辑仍原地更新正式 storyboard。更新时会：

```text
imagePreflight = null
candidates = []
layout = null
Chapter.status -> storyboard_done
```

这会丢失可追溯的候选、布局和成品历史，也无法支持用户比较返修前后结果。

### 3.4 出图准备

当前确认记录使用：

```text
sourceStoryboardId
sourceStoryboardUpdatedAt
```

它能拦住部分明显旧分镜，却无法证明：

- 角色外貌/prompt/定稿图是否改变；
- 场景参考图是否增加或更换；
- 项目画风是否改变；
- 同一时间戳下内容是否真的相同。

`resolveImagePreflightCharacter` 还会直接修改已确认 storyboard 的角色绑定，进一步破坏版本不可变性。

### 3.5 工作流

前后端分别用 `Chapter.status` 推导 `done/active/waiting`。目前无法同时表达：

```text
章节曾经 exported
旧导出仍可下载
剧本有未确认修改
结构仍来自旧剧本
新候选任务应禁止
```

## 4. 总体模型

### 4.1 四层版本链

```text
Chapter.scriptWorkingText
  --完成本章/确认新版本-->
ChapterScriptVersion(current)
  --生成/编辑/确认-->
StoryVersion(current)
  --生成/编辑/确认-->
StoryboardVersion(current)
  --重新计算并确认-->
PreflightRevision(current)
```

每个箭头都必须满足：

- 上游 current 存在；
- 上游来源链为 current；
- 上游没有 active dirty/pending 工作稿；
- 提交携带 expected current ID、expected digest 或 rowVersion；
- 服务端在事务内重新验证。

### 4.2 不增加新通用表

沿用 G1 44 模型：

| 层级 | Working Copy | 正式版本 | current 指针 |
| --- | --- | --- | --- |
| 剧本 | `Chapter.scriptWorkingText/scriptWorkingDigest/scriptWorkingState` | `ChapterScriptVersion` | `Chapter.currentScriptVersionId` |
| 剧情结构 | `StoryVersion(status=pending_confirmation)` | `StoryVersion(status=confirmed)` | `pendingStoryVersionId/currentStoryVersionId` |
| 分镜 | `StoryboardVersion(status=pending_confirmation)` | `StoryboardVersion(status=confirmed)` | `pendingStoryboardVersionId/currentStoryboardVersionId` |
| 出图准备 | 无独立 Working Copy；实时 preview | `PreflightRevision` | `currentPreflightRevisionId` |

G2 只给 Story/Storyboard pending 行补齐 `rowVersion/origin/archivedAt` 等字段，不增加 `Document`、`Freshness` 或通用 `Revision` 表。

### 4.3 三种互不替代的状态

| 维度 | 示例 | 作用 |
| --- | --- | --- |
| 里程碑 | `draft/script_done/.../exported` | 表达曾达到的最远阶段，单调不回退 |
| 版本生命周期 | `pending_confirmation/confirmed/archived` | 表达该行能否编辑、是否正式、是否只读 |
| Freshness | `current/stale/historical/pending` | 表达该版本相对当前来源是否可用于新工作 |

禁止用其中任一维度代替另外两个。

## 5. Working Copy 与发布语义

### 5.1 剧本 Working Copy

`Chapter.scriptWorkingState` 固定为：

```text
empty   没有可发布正文
clean   workingDigest == current ScriptVersion.sourceDigest
dirty   workingDigest != current ScriptVersion.sourceDigest，或尚无 current 但正文非空
```

AI pending 是“待采用建议”，不等于 Working Copy。用户采用后：

1. 更新 `scriptWorkingText/digest/state`；
2. 清除 `ChapterScriptPending`；
3. 不创建 ScriptVersion；
4. 不改变 current 指针；
5. 不使旧下游正式版本 stale。

只在用户再次点击“完成本章”时发布 ScriptVersion。

### 5.2 剧本发布

发布请求必须携带：

```json
{
  "expectedCurrentScriptVersionId": "script_v001",
  "expectedWorkingDigest": "sha256:...",
  "expectedChapterRowVersion": 17,
  "createNextChapter": false
}
```

事务内：

1. 校验 Working Text 非空和摘要一致。
2. 若 working digest 与 current 完全相同，幂等返回 current，不创建空版本。
3. 创建不可变 `ChapterScriptVersion vN`。
4. 更新 `currentScriptVersionId`、working state=`clean` 和里程碑。
5. 将仍基于旧剧本的 active pending StoryVersion 归档并清 pending 指针。
6. 不清 `currentStoryVersionId` 或任何更深层历史。

提交后，旧 current StoryVersion 会因来源不匹配派生为 stale。

### 5.3 剧情结构 Working Copy

首次编辑 confirmed StoryVersion 时执行 copy-on-write：

1. 复制当前 confirmed 文档到新的 pending StoryVersion。
2. 绑定当前 ScriptVersion 的 SourceSnapshot。
3. 分配新的单调 version；被放弃的 pending 也不复用版本号。
4. 设置 `pendingStoryVersionId`。
5. 后续字段保存只更新该 pending 行，并使用 rowVersion 乐观锁。

AI 重新生成也创建一个新的 pending 目标。若替换现有 pending：

- 旧 pending 变 archived；
- active pending 指针切到新行；
- 关联旧任务请求协作取消；
- 旧任务迟到不能写新 pending。

### 5.4 剧情结构确认

确认不再接收一份可绕过 Working Copy 的完整 Json。请求只引用 pending：

```json
{
  "pendingStoryVersionId": "story_v004",
  "expectedPendingDocumentDigest": "sha256:...",
  "expectedCurrentStoryVersionId": "story_v002",
  "expectedSourceDigest": "sha256:...",
  "expectedChapterRowVersion": 22
}
```

确认事务顺序：

1. 重读 current ScriptVersion 和 pending StoryVersion。
2. 确认剧本 Working Copy clean、无 Script pending。
3. 校验 pending 来源与当前 ScriptVersion 完全匹配。
4. 先完成角色 ID 解析和规范化，再计算最终 documentDigest。
5. 将 pending 转为 confirmed 并生成 Scene/Beat 投影。
6. 切换 `currentStoryVersionId`，清 `pendingStoryVersionId`。
7. 归档仍基于旧 StoryVersion 的 active pending StoryboardVersion。
8. 不清 current Storyboard、Preflight、Candidate、Layout 或 Export。

### 5.5 分镜 Working Copy 与确认

分镜使用与 Story 相同的 copy-on-write 规则。正式编辑接口只更新 pending StoryboardVersion，禁止修改 confirmed 行。

确认时：

- 来源必须是 current StoryVersion；
- Story Working Copy 不得 dirty/pending；
- 同事务写 Storyboard 文档、Shot/角色投影和 current 指针；
- 当前版本删除的 Shot 标记 retired，不硬删除；
- 新增 Shot 由服务端分配稳定 ID；
- 已 retired 的 Shot ID 不允许在以后版本重新激活；
- 重排只改变 projection order，不改变 Shot ID；
- 不删除旧 Candidate、Preflight、Layout、Export 或任务。

### 5.6 出图准备

Preflight 没有长期可编辑 Working Copy。页面每次打开都计算 live preview；用户确认时提交 `expectedSourceDigest`：

```json
{
  "expectedSourceDigest": "sha256:...",
  "notes": "本章统一冷灰雨夜色调"
}
```

服务端事务前重新构建来源快照和检查结果。来源已变化返回 409；检查阻塞返回 400。成功后插入不可变 PreflightRevision 并切 current 指针。

相同来源、相同 notes/documentDigest 的重复确认幂等返回 current；来源相同但 notes 不同可创建新 revision，但不会把旧候选误判为内容来源不同。

## 6. 摘要与来源快照

### 6.1 三类摘要

| 摘要 | 对象 | 含义 |
| --- | --- | --- |
| `sourceDigest`（ScriptVersion） | 规范化章节正文 | 正式剧本内容摘要 |
| `documentDigest` | Story/Storyboard/Preflight 文档 | 该版本自身规范内容摘要 |
| `sourceDigest`（下游版本/任务） | SourceSnapshot | 该结果实际读取的来源集合摘要 |

字段名称相同不代表算法输入相同；必须由类型化 codec 生成，业务 Service 不自行拼字符串。

### 6.2 SourceSnapshot 示例

StoryVersion：

```json
{
  "schemaVersion": 1,
  "policyVersion": "story-source-v1",
  "projectId": "project_001",
  "chapterId": "chapter_001",
  "consumerType": "story_version",
  "sources": [
    {
      "role": "script",
      "entityType": "chapter_script_version",
      "entityId": "script_v002",
      "digest": "sha256:script-body"
    }
  ]
}
```

StoryboardVersion 的 sources 改为 current StoryVersion ID + documentDigest。

PreflightRevision 使用聚合快照：

```json
{
  "schemaVersion": 1,
  "policyVersion": "preflight-source-v1",
  "projectId": "project_001",
  "chapterId": "chapter_001",
  "consumerType": "preflight_revision",
  "storyboard": {
    "id": "storyboard_v003",
    "digest": "sha256:storyboard-document"
  },
  "style": {
    "comicFormat": "vertical_scroll",
    "artStyle": "comic_style"
  },
  "characters": [],
  "scenes": []
}
```

数组按稳定 key 排序，再使用 RFC 8785 JCS + SHA-256。时间戳、文件路径、数据库行顺序和本地绝对路径禁止进入快照。

### 6.3 文档摘要排除项

StoryDocument V2 不把以下内容作为剧情结构语义：

- `createdAt/updatedAt/confirmedAt`；
- 场景参考图 `referenceAssetId`；
- UI 展开状态和临时校验信息。

场景语义仍在 StoryVersion；场景视觉进入 `ChapterScene.currentVisualId -> SceneVisual -> Asset`，只影响 Preflight。

StoryboardDocument V2 不把以下内容作为分镜语义：

- `createdAt/updatedAt/confirmedAt`；
- `lockedCandidateId/currentCandidateLockRevisionId`；
- `image_generated/locked` 等下游生成状态；
- 缩略图、UI selection 和临时拖拽状态。

镜头顺序、角色绑定、scene/beat、动作、情绪、景别、机位、comic/motion 和 `promptDraft` 属于分镜语义，进入 documentDigest。

### 6.4 Preflight 生成输入摘要

只收集当前 storyboard 实际引用的实体：

- StoryboardVersion ID + documentDigest；
- `comicFormat/artStyle` 和后续明确的风格配置摘要；
- 出镜角色的稳定 ID、生成相关字段摘要、选用 CharacterVisual、Asset ID/sha256；
- 被镜头引用场景的 ChapterScene、选用 SceneVisual、Asset ID/sha256；
- 角色/场景选择策略的 `policyVersion`。

角色展示排序、卡片更新时间、未出镜角色和未使用 Asset 不进入摘要。

## 7. Freshness 规则

### 7.1 四态定义

| Freshness | 精确定义 | 是否可启动新下游 |
| --- | --- | --- |
| `current` | current 指针指向 confirmed，且来源 ID/摘要等于当前上游 | 还需 Working Copy gate 通过 |
| `stale` | current 指针存在，但来源不匹配或来源不可解析 | 否 |
| `historical` | 非 current confirmed，或已放弃的 archived pending 行；后者只供审计，永不作为 formal source | 否，只读 |
| `pending` | active pending 指针指向的未确认行 | 否 |

Freshness 不写回版本行；由 `FreshnessResolver` 统一计算。

### 7.2 传递规则

```text
Story current
  = sourceScriptVersionId == Chapter.currentScriptVersionId
  && sourceDigest == 当前 Script SourceSnapshot digest

Storyboard current
  = Story current
  && sourceStoryVersionId == Chapter.currentStoryVersionId
  && sourceDigest == 当前 Story SourceSnapshot digest

Preflight current
  = Storyboard current
  && sourceStoryboardVersionId == Chapter.currentStoryboardVersionId
  && sourceDigest == 当前 Preflight SourceSnapshot digest
```

任何上游 stale 都向下传递，但不批量更新或删除下游行。

### 7.3 Working Copy gate

Freshness current 不等于当前允许新任务。例如 current StoryVersion 仍与 current ScriptVersion 匹配，但用户已有 dirty Script Working Copy。此时：

- 旧 Story/Storyboard/Export 仍是当前已发布链，可查看；
- workflow 的剧本步骤显示 `needs_confirmation`；
- 新 `story_parse/shot_generate/image_generate` 均阻止；
- 用户必须发布或还原 Working Copy。

该规则避免生成一批马上会过期的新结果。

### 7.4 未知来源

旧数据缺来源 ID、摘要无法重建、跨作用域引用或 codec 失败时：

```text
freshness = stale
reasonCode = *_SOURCE_UNRESOLVED
canStartTask = false
```

不要新增含义模糊的 `unknown` freshness，也不要把它默认为 current。

## 8. Workflow V2 投影

### 8.1 对外字段

在保留现有 step key 的基础上，`ProjectWorkflowStep` 增加：

```json
{
  "status": "needs_update",
  "milestoneReached": true,
  "currentArtifactId": "story_v001",
  "freshness": "stale",
  "attention": "source_updated",
  "canStartTask": false,
  "historyAvailable": true,
  "reasonCodes": ["STORY_SOURCE_SCRIPT_CHANGED"]
}
```

状态枚举扩展为：

```text
done | active | waiting | blocked | needs_confirmation | needs_update
```

- `needs_confirmation`：有 dirty Working Copy 或 active pending。
- `needs_update`：曾完成但 current 正式版本 stale。
- `blocked`：缺完整性条件、来源不可解析或上游动作未完成。

### 8.2 currentStepKey

`currentStepKey` 改为“当前最早需要用户处理的步骤”，优先顺序：

1. dirty/empty Script Working Copy；
2. active pending Story；
3. stale/missing Story；
4. active pending Storyboard；
5. stale/missing Storyboard；
6. stale/missing/blocked Preflight；
7. G4–G6 后续当前动作。

路由不受此限制：用户仍可打开历史候选、布局和导出页面。

### 8.3 前后端单一推导

服务端 `ChapterProductionStateResolver` 是权威入口，同时生成：

- `versionChain`；
- `workflow`；
- 任务 gate；
- 对话上下文中的当前正式来源。

前端不再维护另一套按 `Chapter.status` 猜测的完整状态机，只消费服务端投影；局部乐观更新必须复用共享纯函数和同一 DTO。

## 9. 字段级失效矩阵

| 动作 | 正式 current 是否立即变化 | 下游 freshness | 新任务 |
| --- | --- | --- | --- |
| 编辑剧本 Working Copy | 否 | 旧正式链仍 current | 阻止，先确认/还原剧本 |
| 采用 AI 剧本草稿 | 否 | 旧正式链仍 current | 阻止，先完成本章 |
| 发布新 ScriptVersion | 是 | Story 及更深层 stale | 只能重做/确认 Story |
| 编辑 Story pending | 否 | 旧正式链仍 current | 阻止 shot_generate 及更深任务 |
| 确认新 StoryVersion | 是 | Storyboard 及更深层 stale | 只能重做/确认 Storyboard |
| 只增加/更换 SceneVisual | 否 | Storyboard 不变；Preflight stale | 重新确认 Preflight |
| 修改角色生成相关字段/Visual | 否 | Story/Storyboard 不变；Preflight stale | 重新确认 Preflight |
| 编辑 Storyboard pending | 否 | 旧正式链仍 current | 阻止 Preflight/候选新任务 |
| 确认新 StoryboardVersion | 是 | Preflight 及更深层 stale | 重新确认 Preflight |
| 重排镜头 | 只在确认后变化 | Preflight stale | 同上 |
| 候选收藏/定稿 | 不改变 Storyboard digest | G2 上游不变 | G4 决定 Layout freshness |
| 修改时间戳/卡片展开状态 | 否 | 不变 | 不影响 |
| 仅修改 Preflight notes | 新 PreflightRevision | sourceDigest 不变 | 已有来源仍可追溯 |

## 10. API 迁移

### 10.1 保留路径、改变语义

| 当前能力 | G2 语义 |
| --- | --- |
| 保存章节草稿 | 只更新 Script Working Copy；返回 workingState/digest |
| 完成本章 | 发布 ScriptVersion；带 expected 字段和幂等 |
| 采用 AI pending | 只采用到 Working Copy，不发布 |
| 更新剧情结构 | 创建/更新 pending StoryVersion，不改 confirmed |
| 确认剧情结构 | 只确认指定 pending ID，不接收绕过 pending 的完整 Json |
| 更新分镜 | 创建/更新 pending StoryboardVersion，不改 confirmed |
| 确认分镜 | 只确认指定 pending ID，不清历史下游 |
| 确认出图准备 | 带 expectedSourceDigest，插入 PreflightRevision |

### 10.2 新增能力

- 还原 Script Working Copy 到 current ScriptVersion。
- 丢弃/归档 Story pending。
- 丢弃/归档 Storyboard pending。
- 获取 `ChapterVersionChain/ProductionState`。
- 获取 live Preflight preview 和 sourceDigest。
- 获取版本历史列表和单版本只读详情。

### 10.3 清空与重置

“清空本章”不再删除 ScriptVersion 和下游历史：

- 对未发布 draft：可把 Working Copy 置空。
- 对已有正式版本：只把 Working Copy 置空并显示未确认，不能发布空版本；用户可还原或输入新正文后发布。
- 项目级 reset 继续只作为维护能力，必须有影响预览和备份，不作为普通编辑按钮。

## 11. 任务来源与迟到结果

### 11.1 创建任务

| 任务 | 必须绑定 |
| --- | --- |
| `story_parse` | current ScriptVersion ID/digest、目标 pending StoryVersion ID、Chapter rowVersion |
| `shot_generate` | current StoryVersion ID/documentDigest、目标 pending StoryboardVersion ID |
| Preflight 相关检查 | current StoryboardVersion、角色/场景/风格聚合快照 |
| `shot_prompt_generate/image_generate` | current PreflightRevision + 完整 sourceDigest；G4 再补候选来源 |

创建任务前统一执行 `NewWorkGate`；客户端不能通过直接调用 Tasks API 绕过。

PreflightRevision ID 记录任务由哪次确认放行，生成语义适用性比较 aggregate sourceDigest。只修改 notes 且 notes 不参与 provider 输入时，不因 revision ID 变化误判旧任务过期；一旦 notes 被纳入实际生成输入，必须升级 source policy 并让 sourceDigest 同步变化。

### 11.2 routing target 与 pending 写目标

AI 生成前先创建一个合法的 pending 目标版本并切 active pending 指针。`story_parse/shot_generate` 的 `GenerationTask.targetType=chapter,targetId=Chapter.id`，分别由 input 的 `chapterId` 与 routing target 精确相等；输出写目标独立保存为 `expectedTargetId`，分别指向 active pending StoryVersion/StoryboardVersion，并携带该 pending 行自己的 `expectedTargetRowVersion`。Chapter.rowVersion 是 Chapter 命令 CAS，不得代替 pending rowVersion。pending 的 `generationState` 从关联 GenerationTask 及 writeTargetBinding 派生：

创建事务按 TaskPolicyRegistryV1 的占位符绑定，用冻结的 `input.expectedTargetId` 只计算一次 idempotencyKey 并保存到 Task；后续重放只读取已保存 key，不得从 Chapter 当前/active pending 指针重新计算。若任务 A 创建后 active pending 从 A 切到 B，A 的 key 仍绑定 A；指针变化只会让 A 的完成结果进入 historical 分支，不能把 A 的身份悄悄改成 B。

```text
generating  有非终态 target task
ready       无非终态 task且文档通过 codec
failed      最新 target task 失败，工作稿可重试或丢弃
```

不为此增加第二套权威状态字段。

### 11.3 完成写回

worker 在短事务中同时验证：

- claimToken 仍属于当前 attempt；
- task sourceDigest 未变；
- Chapter current 上游 ID/digest 仍匹配；
- active pending 指针仍指向 `input.expectedTargetId`，不是拿 Chapter routing target 比较；
- pending 自身 rowVersion/documentDigest 等于 `expectedTargetRowVersion` 等任务预期；
- 未收到取消请求。

任一适用性条件失败：

```text
任务 runtime 可 succeeded
output/applicability = historical
不更新 pending 文档
不切 current 指针
不覆盖用户编辑
```

## 12. 旧数据迁移

### 12.1 Script

| 旧情况 | 迁移 |
| --- | --- |
| `script.md` 与 current version 正文摘要一致 | workingState=`clean` |
| 两者不同 | workingState=`dirty`，保留 current 和旧下游 |
| 有正文但无版本且章节只是 draft | Working Copy dirty，等待用户完成 |
| 章节声称已完成但无可恢复版本 | 迁移 issue，不能伪造 current ScriptVersion |

### 12.2 Story/Storyboard

- 用 v2 codec 规范化 confirmed 文档并保存原始 payload digest 到 `ImportedEntitySource`。
- 来源 ID 存在且同作用域时计算 SourceSnapshot。
- 来源缺失或跨作用域时保留版本，freshness=`stale`，reason=`*_SOURCE_UNRESOLVED`。
- legacy Story 场景 `referenceAssetId` 提升为 SceneVisual 关系，不参与 Story documentDigest。
- legacy Storyboard 的 `lockedCandidateId/status` 迁到 G1/G4 对应实体，不参与 Storyboard documentDigest。

### 12.3 Preflight

旧 preflight 没有完整角色/场景/风格来源证据：

- 有任务 input 或直接证据能重建完整来源集合时，计算 sourceDigest。
- 只有 storyboard ID/时间时，绝不插入 `PreflightRevision`：原始旧 JSON/时间与文件摘要只作为 `ImportedEntitySource` provenance 和 `legacy_metadata.archive` 只读归档保存，不冒充正式确认记录；创建 blocker `PREFLIGHT_SOURCE_UNRESOLVED`，保持 `Chapter.currentPreflightRevisionId=null`。final 前用户必须签署 `drop_current_preflight_and_reconfirm_after_cutover`，把 action/acknowledged consequences/证据摘要写入 resolutionJson 并纳入 `decisionsDigest` 后才可 resolve issue；DB-only 后重新确认出图准备前，`NewWorkGate` 持续拒绝 `shot_prompt_generate/image_generate`。
- 禁止按迁移当下的最新角色图“补猜”旧确认使用过的素材。

### 12.4 已丢失历史

旧实现曾因分镜编辑清空 candidates/layout。迁移器只能报告：

```text
PRE_G2_HISTORY_ALREADY_DELETED
```

不能凭文件名、mtime 或剩余 Asset 伪造被删除的版本关系。

## 13. 实施切片

### G2-A：Codec、Schema overlay refinement 与 Resolver

- 增加 ScriptText/Story/Storyboard/Preflight/SourceSnapshot codec。
- G1 base 已预建 Story/Storyboard 的 rowVersion/origin/archivedAt，并已拥有 current=confirmed、pending=pending_confirmation、source 完整与基础 formal/projection immutable；G2 overlay 只补 active pending 唯一生命周期、rowVersion/CAS、freshness 与 NewWorkGate，不重复 ADD COLUMN 或重复声明基础不可变。
- G1 runtime V1 历史继续合法；G2 上线后新 runtime 与待确认 pending 使用 V2，遗留 V1 pending 必须先经 Codec 显式重编码，不能直接被 V2-only confirm guard 卡死或暗改 confirmed 历史。
- 建 `ChapterProductionStateResolver`、reason code 和 DTO。
- 导入器接入 v2 摘要，但不改用户交互。

退出闸门：摘要 golden test、current/stale/historical/pending 组合测试和 DB 约束通过。

### G2-B：Script Working Copy 与发布

- 保存、AI 采用、完成、还原、清空语义迁移。
- 发布事务和并发冲突。
- 已导出章节修改剧本不清下游。

退出闸门：G0 S1-06/S1-07 转绿。

### G2-C：Story Working Copy

- 生成目标、copy-on-write、字段编辑、确认、丢弃。
- 角色回填在摘要前完成。
- `story_parse` source/target guard。

退出闸门：G0 S2-04/S2-05/S2-06 转绿。

### G2-D：Storyboard Working Copy

- 正式编辑改写 pending。
- 稳定 Shot ID、retire、不复活和投影事务。
- preflight 角色修复不再改 confirmed storyboard。
- `shot_generate` source/target guard。

退出闸门：G0 S3-05/S3-06/S3-07 的错误语义被替换。

### G2-E：Preflight 与 Workflow V2

- 聚合角色/场景/风格 SourceSnapshot。
- live preview、确认、stale reason。
- workflow DTO、项目/章节状态投影和前端提示。
- 候选任务入口统一 NewWorkGate。

退出闸门：G0 S4-05/S4-06、X-04/X-05 转绿。

### G2-F：故障与用户路径复核

- 并发发布、迟到任务、重启、迁移 unresolved、历史查看。
- Playwright 覆盖“编辑但未确认”和“发布后逐级更新”。
- Scrutiny + Runtime/User Review。

退出闸门：G2 验收清单全部有证据。

## 14. 回滚与发布

### 14.1 发布前

- G0 与正式 migration tree、C3 Project/Chapter/Script substrate 必须已通过隔离验收；完整 G1/WIT-01 是生产发布前置，不是 G2 开发前置。
- 对 DB 和 ready Asset 做协调备份。
- 在生产样例副本执行旧数据摘要 dry-run。
- unresolved 数量必须可解释。

### 14.2 切片回滚

- G2-A 至 G2-E 每一步只允许向前兼容迁移。
- UI 可暂时回退展示，但写入口不能恢复原地覆盖或清历史。
- 新字段可先双读兼容，禁止 DB/文件双写。
- 一旦写入第二个正式版本，旧应用若不理解版本链不得启动写模式。

### 14.3 数据回滚

- 尚无 G2 业务写：可在维护态恢复 G2 前协调备份。
- 已有 G2 业务写：只允许回滚到兼容版本链的应用，或恢复完整 DB + Asset 备份；不能把多版本压回单行。

## 15. 风险

| 风险 | 处理 |
| --- | --- |
| 用户认为改字即已生效 | 编辑器持续显示“有未确认修改”，明确完成/确认动作 |
| 所有下游被过度标 stale | 用 v2 codec 排除时间戳、资产展示和候选状态 |
| scene/character 变化漏进 Preflight | 聚合快照列出真实使用实体和 policyVersion |
| 两个页面同时确认 | expected ID/digest/rowVersion，冲突返回 409 |
| 旧任务覆盖用户正在编辑的 pending | task target + active pending 指针 + rowVersion + claimToken 四重 guard |
| workflow 前后端漂移 | 服务端权威投影，前端不重写业务状态机 |
| 迁移把未知旧来源当 current | unresolved reason 阻止新任务，用户重新确认 |

## 16. 验收摘要

G2 至少证明：

1. 编辑已发布剧本但未完成时，旧导出仍可看，所有新下游任务被阻止。
2. 发布新剧本只改变 Script current；旧 Story/Storyboard/Preflight 保留并派生 stale。
3. Story/Storyboard 编辑只写 pending；confirmed 行数据库级不可更新。
4. 确认新 Story/Storyboard 后，旧版本变 historical，不删除候选、布局或导出。
5. SceneVisual/CharacterVisual/画风变化只让 Preflight stale，不错误地改 Story/Storyboard 摘要。
6. `lockedCandidateId/status` 变化不改变 Storyboard documentDigest。
7. 迟到任务不更新 active pending/current。
8. `Chapter.milestoneStatus` 在返修过程中保持最远里程碑。
9. 旧 preflight 证据不足时要求重新确认，不伪造来源。
10. 前端用“有未确认修改 / 来源已更新 / 历史版本”完成真实用户路径。

详细字段、接口、错误码和算法见 `2026-07-11_G2版本来源与Freshness契约字典.md`；完整自动化与人工验收见 `G2上游版本链与失效验收清单.md`。

## 17. 关联文档

- `文档/04_方案与决策/ADR-0013_上游版本链与派生Freshness.md`
- `文档/04_方案与决策/2026-07-11_G2版本来源与Freshness契约字典.md`
- `文档/06_测试与验收/G2上游版本链与失效验收清单.md`
- `文档/04_方案与决策/2026-07-11_G1数据库事实源与DB-only切换开发方案.md`
- `文档/04_方案与决策/2026-07-11_G1数据库Schema字典与旧数据映射.md`
- `文档/04_方案与决策/2026-07-10_七阶段能力缺口与升级顺序.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_依赖边界与阶段门禁.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_数据库Overlay清单.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_文件Repository与事务地图.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_API与幂等契约.md`
- `文档/06_测试与验收/G2施工包_可执行测试与证据计划.md`
