---
doc_id: AIR-CONTRACT-20260711-G2-VERSION-FRESHNESS
status: active
created: 2026-07-11
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 已确认 G2 上游版本链开发方案、G1 Schema 字典、现有共享 DTO 与 Service 审计
---

# G2 版本来源与 Freshness 契约字典

## 1. 文档定位

本文给出 G2 实施时可直接复制的字段、枚举、摘要、算法、DTO、接口、错误码和任务来源协议。它补充 G1 44 模型，不新增模型，也不代表当前代码已经具备这些字段。

优先级：

```text
ADR-0013
  -> G2 五份施工资料（实施边界、DB 对象、文件事务、API 幂等、测试入口）
  -> 本契约字典（领域字段、Codec、Freshness）
  -> G2 主开发方案
  -> 实现代码与测试
```

如实现与本文冲突，应先更新已采纳契约并重新取得决策确认，不能在代码中默默另造语义。

本文第 10 节 API 和第 15 节数据库约束保留领域总则；完整 request/response、旧路由、丢响应重放、`0009` 的 2 index/14 trigger 以 2026-07-12 G2 施工包为唯一实施清单。

## 2. 统一术语与枚举

### 2.1 版本生命周期

```ts
type VersionLifecycleStatus =
  | "pending_confirmation"
  | "confirmed"
  | "archived";
```

| 状态 | 可修改 document/source | 可成为 current | 说明 |
| --- | --- | --- | --- |
| `pending_confirmation` | 是，必须 rowVersion | 否 | active pending 指针指向时是当前工作稿 |
| `confirmed` | 否 | 是 | 用户已确认的正式版本；离开 current 后仍保持 confirmed |
| `archived` | 否 | 否 | 仅未确认 pending 被替换/放弃；G1/G2 不把曾 confirmed 版本改成 archived |

生命周期只有 `pending_confirmation→confirmed` 或 `pending_confirmation→archived`。confirmed 离开 current 后仍保持 confirmed，并通过 current 指针派生 historical；archived 必须 `confirmedAt=null/archivedAt非空`。如果未来确需管理性封存曾 confirmed 历史，应新增独立 overlay/审计语义，不能复用本状态静默解冻或改写。

### 2.2 章节最远里程碑

```ts
type ChapterMilestoneStatus =
  | "draft"
  | "script_done"
  | "structured"
  | "storyboard_done"
  | "images_done"
  | "layout_done"
  | "exported";
```

该枚举沿用现有 ChapterStatus 顺序，但字段在 G1 目标模型中命名为 `milestoneStatus`，只允许单调向右推进。

### 2.3 Freshness

```ts
type ArtifactFreshness =
  | "current"
  | "stale"
  | "historical"
  | "pending";
```

Freshness 永远是查询结果，不是客户端可写字段。

### 2.4 Working Copy

```ts
type ScriptWorkingState = "empty" | "clean" | "dirty";

type PendingReadiness =
  | "generating"
  | "ready"
  | "failed";
```

`PendingReadiness` 从指向该 pending 版本的最新 GenerationTask 派生，不保存为版本真值。

### 2.5 Workflow

```ts
type ProjectWorkflowStepStatus =
  | "done"
  | "active"
  | "waiting"
  | "blocked"
  | "needs_confirmation"
  | "needs_update";

type WorkflowAttention =
  | "none"
  | "working_changes"
  | "pending_confirmation"
  | "source_updated"
  | "integrity_blocked";
```

### 2.6 Task applicability

```ts
type TaskApplicability =
  | "current"
  | "historical"
  | "legacy_unresolved";
```

它与任务 runtime status 正交；`succeeded + historical` 是合法结果。

## 3. G1 模型字段细化

### 3.1 `Chapter`

G2 使用以下字段：

```text
milestoneStatus,
scriptWorkingText,
scriptWorkingDigest,
scriptWorkingState,
currentScriptVersionId,
currentStoryVersionId,
pendingStoryVersionId,
currentStoryboardVersionId,
pendingStoryboardVersionId,
currentPreflightRevisionId,
rowVersion
```

约束：

- `scriptWorkingState=empty` 时 working text 规范化后为空，current ScriptVersion 可以存在。
- `clean` 时必须有 current ScriptVersion，且 digest 相同。
- `dirty` 时正文非空且与 current 不同，或没有 current。
- current/pending 指针必须指向同一 project/chapter。
- `milestoneStatus` 只向更远阶段推进；G2 返修不得回退。

### 3.2 `ChapterScriptVersion`

```text
id, chapterId, version,
sourceText, sourceDigest, origin,
createdAt, completedAt
```

约束：

- `origin=user/import/ai_confirmed`。
- `(chapterId, version)` 唯一。
- 创建后所有业务字段不可更新。
- `sourceText` 必须非空且已经过 ScriptTextCodec。
- `sourceDigest=sha256(UTF-8 canonicalSourceText)`。

### 3.3 `ChapterScriptPending`

保持 G1 字段：

```text
id, chapterId, sourceText, sourceDigest, operation,
threadId, messageId, toolCallId,
rowVersion, createdAt, updatedAt
```

采用 pending 时只更新 Chapter working fields，随后删除或归档该 pending；不创建 ScriptVersion。

### 3.4 `StoryVersion`

G1 字段加粗部分由 G2 明确：

```text
id, projectId, chapterId, version, status,
sourceScriptVersionId, sourcePolicyVersion, sourceDigest,
documentJson, schemaVersion, documentDigest,
origin, rowVersion,
createdAt, updatedAt, confirmedAt, archivedAt
```

枚举：

```text
origin = user_edit | ai_generate | import | legacy_import
```

规则：

- pending 可更新 documentJson/documentDigest/rowVersion，但 source ID/policy/digest 在创建后不可切换。
- confirmed 后 source、document、digest、version、origin 不可更新。
- archived 为未确认 pending 的终态，只允许 pending_confirmation→archived 并首次写 `archivedAt`；confirmed 永不转 archived。
- `(chapterId, version)` 唯一，版本号在创建 pending 时分配并永不复用。
- 非 `legacy_import` 的 source ID/policy/digest 必须全部非空。legacy 无法证明的字段可为 null；缺任一项即 `unresolved`，不使用空串或当前 policy 伪造历史，也不得静默设 current。

### 3.5 `StoryboardVersion`

与 StoryVersion 同构：

```text
sourceStoryVersionId, sourcePolicyVersion, sourceDigest,
documentJson, schemaVersion, documentDigest,
origin, rowVersion,
createdAt, updatedAt, confirmedAt, archivedAt
```

confirmed 后文档和来源不可变；Shot/Projection 只能在确认事务由 codec 输出重建。legacy source ID/policy/digest 的 nullable/unresolved 规则与 StoryVersion 完全同构。

### 3.6 `PreflightRevision`

```text
id, projectId, chapterId, version, status,
sourceStoryboardVersionId, sourcePolicyVersion, sourceDigest,
documentJson, schemaVersion, documentDigest, ready,
createdAt, confirmedAt
```

- `status=confirmed/archived`；是否 current/historical 由 Chapter 指针判断，不把 freshness 写回 status。
- 插入后不可修改。
- `ready` 必须与 documentJson 同次计算，不接受客户端布尔值。
- sourceDigest 是聚合来源快照摘要，不是 storyboard documentDigest 的别名。
- 这三个 source 字段始终非空。旧 preflight 的完整来源不可证时，G1 importer 不插入伪 `PreflightRevision`，而是创建 blocker `PREFLIGHT_SOURCE_UNRESOLVED`；final MigrationRun 前必须由用户显式签署 `drop_current_preflight_and_reconfirm_after_cutover`，将该 issue 标为 resolved、把 currentPreflight 指针置空并把决议纳入 `decisionsDigest`，DB-only 后再重新确认。

### 3.7 不新增的模型

G2 明确不新增：

```text
StoryWorkingCopy
StoryboardWorkingCopy
FreshnessState
InvalidationEvent
VersionGraph
```

原因：pending 版本、current 指针、GenerationTaskSource 和派生 resolver 已能完整表达；新增表会形成重复真值。

## 4. Canonical codec

### 4.1 通用输出

每个 codec 返回：

```ts
interface EncodedDocument<T> {
  schemaVersion: number;
  canonical: T;
  canonicalBytes: Uint8Array;
  digest: `sha256:${string}`;
}
```

禁止 Service 自行 `JSON.stringify` 后哈希。

### 4.2 ScriptTextCodec V1

执行顺序：

1. UTF-8 解码并拒绝非法字节。
2. 删除文件开头 BOM。
3. `CRLF/CR -> LF`。
4. 执行项目既有“移除项目级剧本名称”规则。
5. 保留正文内部空格和换行，不按平台重新排版。
6. 去除首尾无意义空白；结果为空则拒绝发布。
7. 对规范文本 UTF-8 bytes 计算 SHA-256。

保存 Working Copy 和发布版本必须使用同一个 codec，不能出现“展示正文”和“摘要正文”两份标准。

### 4.3 StoryDocumentCodec V2

摘要输入包含：

```text
schemaVersion, chapterId,
synopsis, direction,
characters（含 projectCharacterId 和稳定结构字段）,
scenes（不含视觉 Asset）,
beats, notes
```

规范：

- characters/scenes/beats 的顺序是业务语义，保留数组顺序。
- 每个实体 ID 必须稳定且同文档唯一。
- `chapterTitle` 从 Chapter 读取，只是展示投影，不进入 StoryDocument V2 或摘要；单独重命名章节不应让分镜失效。
- `referenceAssetId` 从 v2 文档移除；读取旧 v1 时迁入 SceneVisual 关系。
- `createdAt/updatedAt/sourceScriptVersionId` 在关系字段中表达，不进入 documentDigest。
- 角色 name 匹配/创建和 `projectCharacterId` 回填必须在最终编码前完成。

### 4.4 StoryboardDocumentCodec V2

摘要输入包含：

```text
schemaVersion, chapterId,
shots[].{
  id, order, beatId, sceneId, characterIds,
  coreAction, emotion, shotType, cameraAngle,
  comic, motion, promptDraft
},
notes
```

明确排除：

```text
lockedCandidateId
currentCandidateLockRevisionId
status=image_generated/locked
thumbnail/preview URL
selection/hover/collapse
createdAt/updatedAt/sourceStoryVersionId
```

`chapterTitle` 同样从 Chapter 投影，不进入 StoryboardDocument V2/documentDigest。

旧 `status=draft/ready_for_image/needs_revision` 如仍需要，改名为分镜内容校验结果并作为派生投影；不能与候选生命周期混在文档摘要中。

### 4.5 PreflightDocumentCodec V2

文档保存（来源快照根字段固定命名为 `sourceSnapshot: PreflightSourceSnapshotV1`）：

- 来源快照的可读副本；
- shotCount；
- characterChecks/sceneChecks/styleCheck；
- issues；
- ready；
- notes；
- policyVersion。

`createdAt/confirmedAt` 不进入 documentDigest。notes 进入 documentDigest，但不进入 sourceDigest。

### 4.5.1 V2 完整 strict DTO

以下定义是 V2 codec 的完整允许字段集，不是摘要。每一层对象都使用 exact-key parser：未知字段、重复键、缺失必填字段、未声明 null、显式 `undefined`、NaN/Infinity、错误数组元素或错误 enum 一律拒绝；不能用 TypeScript interface 代替运行时校验。

```ts
interface StoryDirectionV2 {
  logline: string;
  chapterGoal: string;
  coreConflict: string;
  emotionalArc: string;
  endingHook: string;
}

interface StoryCharacterV2 {
  id: string;
  projectCharacterId: string;
  name: string;
  role: string;
  level: "lead" | "recurring" | "chapter" | "minor" | "extra";
  entityType: "human" | "creature" | "group" | "voice";
  motivation: string;
  relationship: string;
  visualTraits: string;
  notes: string;
}

interface StorySceneV2 {
  id: string;
  name: string;
  location: string;
  timeOfDay: string;
  atmosphere: string;
  purpose: string;
}

interface StoryBeatV2 {
  id: string;
  order: number;
  title: string;
  summary: string;
  conflict: string;
  characters: string[];
  sceneId: string | null;
  visualFocus: string;
  outcome: string;
}

interface StoryDocumentV2 {
  schemaVersion: 2;
  chapterId: string;
  synopsis: string;
  direction: StoryDirectionV2;
  characters: StoryCharacterV2[];
  scenes: StorySceneV2[];
  beats: StoryBeatV2[];
  notes: string;
}

interface StoryboardVoiceLineV2 {
  characterId: string | null;
  name: string;
  line: string;
  voiceStyle: string;
}

interface StoryboardComicV2 {
  panelDescription: string;
  composition: string;
  dialogue: string;
  caption: string;
  panelRhythm: "slow" | "normal" | "fast" | "impact" | "transition";
}

interface StoryboardMotionV2 {
  visualDescription: string;
  compositionDesign: string;
  cameraMovement:
    | "static" | "push_in" | "pull_out" | "pan_left" | "pan_right"
    | "tilt_up" | "tilt_down" | "track_left" | "track_right"
    | "slow_zoom" | "handheld" | "none";
  frameType: "atmosphere" | "dialogue" | "action" | "reaction" | "detail" | "transition";
  durationMs: number;
  durationHint: string;
  voiceLines: StoryboardVoiceLineV2[];
}

interface StoryboardShotV2 {
  id: string;
  order: number;
  beatId: string | null;
  sceneId: string | null;
  characterIds: string[];
  coreAction: string;
  emotion: string;
  shotType: "establishing" | "wide" | "full" | "medium" | "close_up" | "extreme_close_up";
  cameraAngle: "eye_level" | "high_angle" | "low_angle" | "over_shoulder" | "top_down" | "dutch_angle";
  comic: StoryboardComicV2;
  motion: StoryboardMotionV2;
  promptDraft: string;
}

interface StoryboardDocumentV2 {
  schemaVersion: 2;
  chapterId: string;
  shots: StoryboardShotV2[];
  notes: string;
}

type PreflightCheckStatusV2 = "ok" | "warning" | "blocked";

interface PreflightCharacterCheckV2 {
  characterId: string;
  name: string;
  level: "lead" | "recurring" | "chapter" | "minor" | "extra";
  appearanceCount: number;
  requiredReference: boolean;
  referenceReady: boolean;
  referenceAssetId: string | null;
  status: PreflightCheckStatusV2;
  note: string;
}

interface PreflightSceneCheckV2 {
  sceneId: string;
  name: string;
  shotCount: number;
  referenceAssetId: string | null;
  referenceReady: boolean;
  status: PreflightCheckStatusV2;
  note: string;
}

interface PreflightStyleCheckV2 {
  comicFormat: "vertical_scroll" | "paged_comic";
  comicFormatLabel: string;
  artStyle: string;
  artStyleLabel: string;
  status: PreflightCheckStatusV2;
  note: string;
}

interface PreflightIssueV2 {
  type:
    | "missing_storyboard" | "unresolved_character" | "missing_reference"
    | "running_reference_task" | "missing_scene" | "missing_scene_reference"
    | "missing_style_context";
  status: "warning" | "blocked";
  message: string;
  relatedName: string | null;
  relatedCharacterId: string | null;
  relatedSceneId: string | null;
  relatedShotId: string | null;
}

interface PreflightDocumentV2 {
  schemaVersion: 2;
  chapterId: string;
  sourceSnapshot: PreflightSourceSnapshotV1;
  shotCount: number;
  characterChecks: PreflightCharacterCheckV2[];
  sceneChecks: PreflightSceneCheckV2[];
  styleCheck: PreflightStyleCheckV2;
  issues: PreflightIssueV2[];
  ready: boolean;
  notes: string;
  policyVersion: "preflight-source-v1";
}
```

Nullability 只有：Story Beat `sceneId`；Storyboard Shot `beatId/sceneId` 与 VoiceLine `characterId`；Preflight referenceAssetId 和四个 issue related 字段。其余字段均非空。允许空字符串的只有可读说明字段（如 notes/dialogue/caption/voiceStyle）；ID、name、policy、enum 和 digest 必须 trim 后非空。所有 order/appearanceCount/shotCount/durationMs 为 integer；order 从 1 连续，计数和 durationMs 非负。ID 在对应数组内唯一，引用必须命中文档或同 scope 关系；characters/scenes/beats/shots 的叙事顺序保留。

`PreflightSourceSnapshotV1` 的完整字段/nullability 以 5.4 为准：characters/scenes 中 visualId/assetId/assetSha256 只能“三者全空”或“三者全非空且 Asset ready”；required=true 时最终 ready 文档不得全空。digest 字段全部是完整 `sha256:*`。

### 4.5.2 V1 → V2 规则

- 既有 confirmed V1 永久保留，由 V1 codec 只读解析；不得为了升级重写 documentJson/documentDigest/projection。
- 仅 active pending V1 可在确认前显式转换。Story 删除 `chapterTitle/sourceScriptVersionId/createdAt/updatedAt`，移除 Scene `referenceAssetId` 并以 SceneVisual 关系保存；所有 projectCharacterId/level/entityType 必须由同 scope 直接证据解析后再产出 V2，无法解析则 `SOURCE_UNRESOLVED`，不猜默认。
- Storyboard 删除 `chapterTitle/sourceStoryVersionId/createdAt/updatedAt/lockedCandidateId/status`；lock/status 只迁到 CandidateLock/派生投影。旧 enum 只能经 ADR-0007 明确映射，未知值拒绝；角色 token 必须解析成 Character.id，无法解析不得确认 V2。
- Preflight V1 的 storyboard updatedAt、当前指针或文件时间不能伪造 SourceSnapshot。只有 storyboard/visual/asset/comicFormat 的直接关系与摘要均可证明时才构造 V2；否则不插入伪 revision，按 `PREFLIGHT_SOURCE_UNRESOLVED` + `drop_current_preflight_and_reconfirm_after_cutover` 决议协议处理。
- 每次转换执行 `parseV1Strict -> migrate -> parseV2Strict -> encode/JCS/digest -> buildProjection`；golden fixture 固定输入/输出/digest。V1 unknown fields 同样拒绝，legacy 原始未知内容只留脱敏迁移证据。

### 4.6 JCS 与排序

- JSON 使用 RFC 8785 JCS。
- SourceSnapshot 的 `sources` 按 `(role, entityType, entityId)` 排序。
- characters 按 `characterId` 排序。
- scenes 按 `(chapterSceneId, sceneKey)` 排序。
- 普通业务文档中具有叙事意义的数组不得为了摘要擅自排序。

### 4.7 Formal projection 的 SQL 展开

G1 base 的 `FormalProjectionRegistryV1` 已冻结 V1/V2 JSON path：Story 使用 `$.scenes/$.beats`，Storyboard 使用 `$.shots` 与每 Shot 的 `$.characterIds`；G1 runtime 仍允许当前 V1。G2 overlay 上线后，新 runtime 与待确认 pending 必须编码 V2；遗留 runtime V1 pending 先显式重编码，既有 confirmed V1 历史不改写。stable id/order/name/summary/beat/scene/character owner-ref 在 parent 仍 pending 时由 JSON1 与关系 projection 精确比对，确认后才封闭并切 current。semanticDigest 不在文档节点内，继续由 V1/V2 Codec 对 canonical fragment 重算和 golden/integration test 保护，不要求不存在的 SQLite SHA-256 UDF。精确字段映射见 `G1数据库Schema实施契约` 7.11。

## 5. SourceSnapshot 契约

### 5.1 通用类型

```ts
interface SourceRefV1 {
  role: string;
  entityType: string;
  entityId: string;
  digest: `sha256:${string}`;
}

interface SourceSnapshotV1 {
  schemaVersion: 1;
  policyVersion: string;
  projectId: string;
  chapterId: string;
  consumerType: string;
  sources: SourceRefV1[];
}
```

`sourceDigest = sha256(JCS(SourceSnapshotV1))`。

版本行必须保存 `sourcePolicyVersion`。Resolver 使用该版本对应的 builder 重建来源；遇到不再支持的 policy 时返回 stale + `SOURCE_POLICY_UNSUPPORTED`，不能直接用当前 policy 重算后声称内容变化。Preflight 的完整 SourceSnapshot 还要保存在 documentJson，GenerationTask 的完整快照保存在 inputJson。

### 5.2 Story source

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
      "digest": "sha256:..."
    }
  ]
}
```

### 5.3 Storyboard source

```json
{
  "schemaVersion": 1,
  "policyVersion": "storyboard-source-v1",
  "projectId": "project_001",
  "chapterId": "chapter_001",
  "consumerType": "storyboard_version",
  "sources": [
    {
      "role": "story",
      "entityType": "story_version",
      "entityId": "story_v003",
      "digest": "sha256:story-document"
    }
  ]
}
```

### 5.4 Preflight source

```ts
interface PreflightSourceSnapshotV1 {
  schemaVersion: 1;
  policyVersion: "preflight-source-v1";
  projectId: string;
  chapterId: string;
  consumerType: "preflight_revision";
  storyboard: {
    id: string;
    digest: `sha256:${string}`;
  };
  style: {
    comicFormat: "vertical_scroll" | "paged_comic";
    artStyle: string;
    styleDigest: `sha256:${string}`;
  };
  characters: Array<{
    characterId: string;
    required: boolean;
    generationInputDigest: `sha256:${string}`;
    visualId: string | null;
    assetId: string | null;
    assetSha256: `sha256:${string}` | null;
  }>;
  scenes: Array<{
    chapterSceneId: string;
    sceneKey: string;
    visualId: string | null;
    assetId: string | null;
    assetSha256: `sha256:${string}` | null;
  }>;
}
```

`generationInputDigest` 只覆盖当前候选生成和参考选择实际使用的字段；V1 为：

```text
characterId, name, entityType, level,
appearance, promptFragment,
选用 reference kind/visual/asset digest
```

`role/personality` 当前只参与角色参考图生成，不在 CharacterVisual 已固定后的候选输入摘要中；若 CandidateGenerationSpec 后续真正读取它们或其他字段，必须先升级 `preflight-source` policyVersion 和测试，不得静默漏出摘要或把未使用字段无意义地加入摘要。

### 5.5 GenerationTaskSource 投影

SourceSnapshot 同事务投影到 `GenerationTaskSource`：

| role | sourceType | sourceId | sourceDigest |
| --- | --- | --- | --- |
| `script` | `chapter_script_version` | script ID | script content digest |
| `story` | `story_version` | story ID | documentDigest |
| `storyboard` | `storyboard_version` | storyboard ID | documentDigest |
| `preflight` | `preflight_revision` | preflight ID | aggregate sourceDigest |
| `character_reference` | `character_visual` | visual ID | underlying ready Asset.sha256；角色生成字段另由 preflight aggregate 覆盖 |
| `scene_reference` | `scene_visual` | visual ID | ready Asset.sha256 |

数据库 sourceType 统一用 snake_case；PascalCase model 名只用于 TypeScript/Prisma 标识，不进入持久值。完整 V1 registry（含 G4/G5 的 lock/layout/export/asset token、owner lookup 与 digest policy）由 `G1数据库Schema实施契约` 10.4.1 冻结。

关系投影不可独立编辑；runtime task input 根对象必须含 `sourceProjection: TaskSourceProjectionV1`，其 sources 使用 `role/order/sourceType/sourceId/sourceDigest`：按 `(role,sourceType,sourceId)` 的 unsigned UTF-8 byte/BINARY 顺序稳定排序、同 role 从 1 连续编号，再以 `(role,order)` 保存；与 GenerationTaskSource 逐项、逐值、计数完全一致后才能 seal。Task.sourceDigest 是 sourceProjection 的 JCS digest。

PreflightRevision ID 用于审计“任务由哪次用户确认放行”，候选任务的生成语义适用性以 aggregate sourceDigest 为准。若只新建 notes 不同但 sourceDigest 相同的 PreflightRevision，旧任务不因 ID 不同自动过期；如果未来 notes 会进入 provider 输入，必须升级 policyVersion 并把 notes 纳入 sourceDigest，不能在 worker 中临时读取。

## 6. FreshnessResolver

### 6.1 输入

```ts
interface ChapterVersionGraphInput {
  chapter: Chapter;
  currentScript: ChapterScriptVersion | null;
  currentStory: StoryVersion | null;
  pendingStory: StoryVersion | null;
  currentStoryboard: StoryboardVersion | null;
  pendingStoryboard: StoryboardVersion | null;
  currentPreflight: PreflightRevision | null;
  currentPreflightSourceSnapshot: PreflightSourceSnapshotV1 | null;
  historyCounts: Record<string, number>;
}
```

### 6.2 单版本规则

```text
if row.id == activePendingPointer && row.status == pending_confirmation
  => pending

else if row.id != currentPointer
  => historical

else if row.status != confirmed
  => stale + LIFECYCLE_INVALID

else if source cannot resolve or digest cannot verify
  => stale + SOURCE_UNRESOLVED

else if source id/digest differs from current upstream
  => stale + SOURCE_CHANGED

else
  => current
```

### 6.3 传递

Storyboard 只有在 current Story freshness=`current` 时才可能 current；Preflight 只有在 current Storyboard freshness=`current` 时才可能 current。

即使子节点自己的直接 ID/digest 暂时相同，上游更早一层 stale 也必须传递 `UPSTREAM_STALE`。

### 6.4 Working gate

```ts
interface NewWorkGateResult {
  allowed: boolean;
  reasons: FreshnessReasonCode[];
  sourceSnapshot: SourceSnapshotV1 | null;
}
```

按任务检查：

| 任务/动作 | 额外禁止条件 |
| --- | --- |
| 发布 Script | working empty、digest/rowVersion 冲突 |
| story_parse | Script dirty/empty、Script pending、Script current 缺失 |
| 确认 Story | Script dirty/pending、pending source mismatch |
| shot_generate | Story pending/stale/missing、Script dirty/pending |
| 确认 Storyboard | Story pending/stale、Storyboard target source mismatch |
| 确认 Preflight | 任一上游 dirty/pending/stale、检查 blocked |
| image task | current Preflight stale/missing、任一上游 dirty/pending |

## 7. Reason code

### 7.1 Working/版本

```text
SCRIPT_VERSION_MISSING
SCRIPT_WORKING_EMPTY
SCRIPT_WORKING_DIRTY
SCRIPT_AI_PENDING
STORY_VERSION_MISSING
STORY_PENDING_CONFIRMATION
STORYBOARD_VERSION_MISSING
STORYBOARD_PENDING_CONFIRMATION
PREFLIGHT_MISSING
```

### 7.2 来源

```text
STORY_SOURCE_SCRIPT_CHANGED
STORY_SOURCE_UNRESOLVED
STORYBOARD_SOURCE_STORY_CHANGED
STORYBOARD_SOURCE_UNRESOLVED
PREFLIGHT_SOURCE_STORYBOARD_CHANGED
PREFLIGHT_CHARACTER_INPUT_CHANGED
PREFLIGHT_SCENE_INPUT_CHANGED
PREFLIGHT_STYLE_INPUT_CHANGED
PREFLIGHT_SOURCE_UNRESOLVED
UPSTREAM_STALE
SOURCE_POLICY_UNSUPPORTED
```

### 7.3 并发/完整性

```text
EXPECTED_CURRENT_VERSION_MISMATCH
WORKING_COPY_CHANGED
PENDING_VERSION_CHANGED
SOURCE_SNAPSHOT_CHANGED
VERSION_SCOPE_MISMATCH
VERSION_LIFECYCLE_INVALID
VERSION_DOCUMENT_INVALID
SHOT_ID_RETIRED
TASK_TARGET_SUPERSEDED
```

UI 必须通过 reason code 映射用户文案，不直接展示英文内部码。

## 8. ChapterProductionState DTO

### 8.1 Version node

```ts
interface VersionNodeState {
  currentVersionId: string | null;
  pendingVersionId: string | null;
  freshness: ArtifactFreshness | null;
  sourceDigest: string | null;
  pendingReadiness: PendingReadiness | null;
  historyCount: number;
  reasonCodes: FreshnessReasonCode[];
}
```

Script node 额外返回：

```ts
interface ScriptVersionNodeState extends VersionNodeState {
  workingState: ScriptWorkingState;
  workingDigest: string | null;
  hasAiPending: boolean;
}
```

### 8.2 完整响应

```ts
interface ChapterProductionState {
  schemaVersion: 1;
  projectId: string;
  chapterId: string;
  chapterRowVersion: number;
  milestoneStatus: ChapterMilestoneStatus;
  script: ScriptVersionNodeState;
  story: VersionNodeState;
  storyboard: VersionNodeState;
  preflight: VersionNodeState;
  earliestAttentionStep: ProjectWorkflowStepKey;
  generatedAt: string;
}
```

`generatedAt` 只用于响应观察，不参与任何摘要或并发判断。

## 9. Workflow DTO

```ts
interface ProjectWorkflowStepV2 {
  key: ProjectWorkflowStepKey;
  label: string;
  status: ProjectWorkflowStepStatus;
  scope: ProjectWorkflowScope;
  summary: string;
  milestoneReached: boolean;
  currentArtifactId: string | null;
  freshness: ArtifactFreshness | null;
  attention: WorkflowAttention;
  canStartTask: boolean;
  historyAvailable: boolean;
  reasonCodes: FreshnessReasonCode[];
  completionCriteria: string[];
}
```

旧 `evidence` 本地文件路径字段在 DB-only 后降级为可选开发诊断，不作为业务完成证据；普通前端使用实体/Asset API。

### 9.1 状态选择表

| 条件 | status | attention |
| --- | --- | --- |
| current 且无工作稿 | `done` | `none` |
| 本步骤从未完成且前置就绪 | `active` | `none` |
| 前置未完成 | `waiting` | `none` |
| 有 dirty/pending | `needs_confirmation` | `working_changes/pending_confirmation` |
| current artifact stale | `needs_update` | `source_updated` |
| integrity/source unresolved | `blocked` | `integrity_blocked` |

同一步只能有一个顶层 status；完整原因保留在 reasonCodes。

## 10. API 契约

### 10.1 Script Working Copy

```text
PATCH /api/projects/{projectId}/chapters/{chapterId}/script/working-copy
```

```json
{
  "sourceText": "...",
  "title": "第 1 章",
  "summary": "...",
  "expectedChapterRowVersion": 12
}
```

返回新的 `ChapterDetail + productionState`。

### 10.2 发布 Script

现有 `/complete` 可保留为兼容路径，但语义等于：

```text
POST /api/projects/{projectId}/chapters/{chapterId}/script/publish
```

```json
{
  "expectedCurrentScriptVersionId": "script_v001",
  "expectedWorkingDigest": "sha256:...",
  "expectedChapterRowVersion": 13,
  "createNextChapter": false
}
```

### 10.3 还原 Script Working Copy

```text
POST /api/projects/{projectId}/chapters/{chapterId}/script/working-copy/revert
```

请求带 expected current ID/working digest/rowVersion；恢复为 current 正文并返回 clean。没有 current 时返回 `SCRIPT_VERSION_MISSING`，不能凭空清空。

### 10.4 Story Working Copy

```text
POST   .../story-structure/working-copy          # 从 current clone 或创建空 pending
PATCH  .../story-structure/working-copy          # rowVersion 更新
DELETE .../story-structure/working-copy          # archive + 清 pending 指针
POST   .../story-structure/working-copy/confirm  # pending -> confirmed
```

confirm 请求：

```json
{
  "pendingVersionId": "story_v004",
  "expectedPendingDocumentDigest": "sha256:...",
  "expectedCurrentVersionId": "story_v002",
  "expectedSourceDigest": "sha256:...",
  "expectedChapterRowVersion": 20
}
```

### 10.5 Storyboard Working Copy

与 Story 路径同构：

```text
.../storyboard/working-copy
.../storyboard/working-copy/confirm
```

新 Shot 的创建命令不接受客户端最终 ID；服务端返回 stable Shot ID。全量文档保存时，服务端拒绝未知客户端 ID 或已 retired ID。

### 10.6 Preflight

```text
GET  .../image-preflight/preview
POST .../image-preflight/confirm
```

preview：

```json
{
  "ready": true,
  "sourceDigest": "sha256:...",
  "issues": [],
  "currentRevision": {
    "id": "preflight_v001",
    "freshness": "stale",
    "reasonCodes": ["PREFLIGHT_CHARACTER_INPUT_CHANGED"]
  }
}
```

confirm：

```json
{
  "expectedSourceDigest": "sha256:...",
  "notes": "..."
}
```

### 10.7 历史

四层分别提供只读列表和详情；不得通过历史详情接口修改或“重新设为 current”。恢复旧内容必须 copy 为新 pending，再由用户确认。

## 11. HTTP 错误

| HTTP | code | 场景 |
| --- | --- | --- |
| 400 | `SCRIPT_WORKING_EMPTY` | 发布空剧本 |
| 400 | `VERSION_DOCUMENT_INVALID` | codec/字段校验失败 |
| 400 | `VERSION_SCOPE_MISMATCH` | 版本不属于当前 chapter/project |
| 400 | `SHOT_ID_RETIRED` | 新分镜试图复活 retired Shot |
| 409 | `EXPECTED_CURRENT_VERSION_MISMATCH` | current 在预览后变化 |
| 409 | `WORKING_COPY_CHANGED` | working digest/rowVersion 变化 |
| 409 | `PENDING_VERSION_CHANGED` | pending 指针或 digest 变化 |
| 409 | `SOURCE_SNAPSHOT_CHANGED` | 上游来源集合变化 |
| 409 | `UPSTREAM_WORK_NOT_CONFIRMED` | dirty/pending 阻止新任务 |
| 409 | `UPSTREAM_SOURCE_STALE` | current 下游来源已过期 |
| 409 | `TASK_TARGET_SUPERSEDED` | 旧任务 target 不再 active |
| 422 | `SOURCE_UNRESOLVED` | 旧来源无法验证，需要用户重做/确认 |

客户端遇到 409 必须重新拉 `productionState`；不能用本地对象强行重试。

## 12. 事务契约

### 12.1 Script 发布事务

```text
read Chapter + current Script + active pending Story
  -> compare rowVersion/current/working digest
  -> insert ScriptVersion
  -> update Chapter current/working/milestone/rowVersion
  -> archive incompatible pending Story and clear pending pointer
  -> commit
```

不更新 confirmed Story/Storyboard/Preflight 或下游产物。

### 12.2 Story 确认事务

```text
read Chapter/current Script/current Story/pending Story/pending Board
  -> NewWorkGate
  -> normalize + resolve character IDs + encode
  -> 在 parent 仍为 pending_confirmation 时 rebuild Story projections
  -> formalize guard 通过后 update pending status confirmed（条件 rowVersion）
  -> switch current Story / clear pending Story
  -> archive incompatible pending Board / clear pending Board pointer
  -> increment Chapter rowVersion
  -> commit
```

### 12.3 Storyboard 确认事务

```text
read Chapter/current Story/current Board/pending Board
  -> NewWorkGate
  -> validate stable Shot IDs
  -> active/retire Shot identities
  -> 在 parent 仍为 pending_confirmation 时 rebuild projections
  -> formalize guard 通过后 confirm pending Board
  -> switch current Board / clear pending Board
  -> increment Chapter rowVersion
  -> commit
```

不清 Preflight/Candidate/Layout/Export。

### 12.4 Preflight 确认事务

SourceSnapshot、Asset sha256 和 live checks 可在事务前构建；事务内必须重新读取所有 current ID/digest 并确认快照仍一致，然后插入 revision 和切指针。网络、文件读取和图片探测不得在事务内执行。

## 13. 任务完成适用性

```ts
interface TaskCompletionApplicabilityInput {
  taskId: string;
  claimToken: string;
  chapterId: string;
  expectedTargetId: string;
  expectedTargetRowVersion: number;
  sourceDigest: string;
}
```

`story_parse` 与 `shot_generate` 的冻结幂等模板分别为：

```text
story-parse:{projectId}:{chapterId}:{expectedTargetId}:{sourceDigest}:{inputDigest}
shot-generate:{projectId}:{chapterId}:{expectedTargetId}:{sourceDigest}:{inputDigest}
```

其中 `{expectedTargetId}` 唯一绑定 `input.expectedTargetId`，并在 Task 创建事务冻结；不得绑定或重读 Chapter 的 `pendingStoryVersionId` / `pendingStoryboardVersionId`。全部占位符到唯一来源的机械映射以《G1任务与Outbox实施注册表》3.4 节为准。

条件更新至少包含：

```text
task.claimToken == input.claimToken
task.cancelRequestedAt is null
task.targetType == chapter
task.targetId == input.chapterId
active pending pointer == expectedTargetId
target.rowVersion == expectedTargetRowVersion
recomputed sourceDigest == task.sourceDigest
```

这里的 `target` 在后两行专指 write target（pending StoryVersion/StoryboardVersion），不是 `GenerationTask.targetId`。`GenerationTask.targetId` 是 Chapter routing/owner identity；`expectedTargetRowVersion` 是 pending 行自己的 CAS 版本，Chapter.rowVersion 仍由 Chapter command 单独携带和校验。

条件失败时，不允许 worker 绕过 Service 直接写版本表。输出登记为 historical，并记录具体 applicability reason。

## 14. 迁移契约

| 旧字段/文件 | G2 目标 | 证据不足处理 |
| --- | --- | --- |
| `script.md` | Chapter working fields | 与版本不同则 dirty |
| `script.versions/*.md` | ScriptVersion | 保留内容摘要与版本号 |
| `structure.json` | confirmed StoryVersion | source 缺失则 stale/unresolved |
| 内存 pending structure | pending StoryVersion | 仅 runtime bundle 可捕获 |
| `storyboard.json` | confirmed StoryboardVersion | source 缺失则 stale/unresolved |
| `storyboard.pending.json` | pending StoryboardVersion | source 不匹配则 archived |
| `preflight.json` | PreflightRevision | 完整来源集合不可证则不插入 revision，创建 `PREFLIGHT_SOURCE_UNRESOLVED` blocker；final 前由用户显式决议 `drop_current_preflight_and_reconfirm_after_cutover` 后标 resolved/current pointer 置空，DB-only 后重确认 |
| scene `referenceAssetId` | SceneVisual | 不进入 Story documentDigest |
| shot `lockedCandidateId/status` | CandidateLock/派生状态 | 不进入 Board documentDigest |
| `workflow.json` | 无 | 从 production state 重建 |

导入器必须输出：

```text
SCRIPT_WORKING_DIRTY_IMPORTED
STORY_SOURCE_UNRESOLVED
STORYBOARD_SOURCE_UNRESOLVED
PREFLIGHT_SOURCE_UNRESOLVED
PRE_G2_HISTORY_ALREADY_DELETED
```

## 15. 数据库约束与 trigger

至少合同测试：

- confirmed/archived StoryVersion 和 StoryboardVersion 的 source/document/version/origin 不可更新。
- pending 行只能在 active pending 指针同作用域下更新；更新必须递增 rowVersion。
- current 指针只能指 confirmed；pending 指针只能指 pending_confirmation。
- 同一版本不能同时被 current 和 pending 指针引用。
- `archivedAt` 与 status 一致。
- ScriptVersion/PreflightRevision 插入后不可更新。
- Shot retired 后不能被新 current StoryboardProjection 重新引用。

Prisma 无法表达的部分继续按 G1 使用定制 migration SQL CHECK/trigger，并做 `sqlite_master` 合同测试。

阶段所有权：G1 base 预建 Chapter/Version 字段，并已拥有 current=confirmed、pending=pending_confirmation、source 完整与基础 formal/projection immutable；本节只有 active pending 唯一生命周期、rowVersion/CAS、freshness 与 NewWorkGate 约束以 G2 overlay manifest 叠加，不重复 ADD COLUMN 或重复声明基础不可变。

## 16. 实施完成条件

1. 本文枚举在 shared/server/web 只有一个定义源。
2. 五类 codec 有 golden fixture，任何字段增删会显式改变或保持 digest。
3. FreshnessResolver 对所有 current/pending/missing/source mismatch 组合有表驱动测试。
4. 所有正式写入口使用 expected current/digest/rowVersion。
5. 任务创建和完成共用 NewWorkGate/ApplicabilityGuard。
6. 前端不再通过 `Chapter.status + updatedAt` 独立推导 G2 freshness。
7. 迁移 unresolved 可枚举、可定位、不可静默 current。

## 17. 关联文档

- `文档/04_方案与决策/ADR-0013_上游版本链与派生Freshness.md`
- `文档/04_方案与决策/2026-07-11_G2上游版本链与Freshness开发方案.md`
- `文档/06_测试与验收/G2上游版本链与失效验收清单.md`
- `文档/04_方案与决策/2026-07-11_G1数据库Schema字典与旧数据映射.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_依赖边界与阶段门禁.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_数据库Overlay清单.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_文件Repository与事务地图.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_API与幂等契约.md`
- `文档/06_测试与验收/G2施工包_可执行测试与证据计划.md`
