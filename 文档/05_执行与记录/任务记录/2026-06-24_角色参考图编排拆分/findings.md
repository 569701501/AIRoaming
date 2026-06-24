# 探索发现与方案拷问

---
doc_id: AIR-TASK-CHARREF-SPLIT-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_角色参考图编排拆分 Orchestrator 阶段
---

## 1. 背景

这是 ProjectsService 拆分的第三轮。前两轮抽出了 Repository + 8 个 util(含 script-import)，Service 从 5236 降到 3518 行。本轮目标是 Service 最大遗留块：角色/场景参考图编排（~622 行）。

上两轮结论：参考图编排"循环依赖未解"，需先抽 ImageProvider 网关。本轮解决这个死结。

## 2. 完整依赖图分析（决定性证据）

角色参考图编排的 44 个相关方法分三层：

### 2.1 纯函数层（零依赖，~20 个）

normalizeProjectCharacter / normalizeCharacterLevel / normalizeCharacterStatus / normalizeCharacterReferenceKind / normalizeEntityType / resolveCardEntityType / defaultReferenceKindForLevel / normalizeRequestedReferenceKind / isProjectCharacterLibraryReady / resolvePrimaryReferenceForLevel / resolveCharacterStatusForReference / sortProjectCharacters / extractCharactersFromProjectSource / withUpdatedProjectCharacter / resolveMoreImportantCharacterLevel / resolveCardLevel / buildStoryStructureCharacterPrompt / getCharacterReferenceAssets / toProjectCharactersResponse / normalizeCharacterName / getDefaultRoleForLevel

**多数已在 character-domain.util.ts（上轮已抽）**。剩余的（extractCharactersFromProjectSource / withUpdatedProjectCharacter / buildStoryStructureCharacterPrompt / resolveCardLevel 等）可补抽，但收益小（每个都 < 55 行，分散）。

### 2.2 出图 HTTP 层（独立，6 个）⭐ 循环依赖的源头

| 方法 | 行 | 依赖 |
| --- | --- | --- |
| requestOpenAiImage | 46 | 纯入参（apiKey/baseUrl/model/prompt） |
| requestOpenAiImageEdit | 58 | 纯入参 + referenceImage buffer |
| requestDoubaoImage | 30 | 纯入参 |
| requestDoubaoImageEdit | 33 | 纯入参 + referenceImage buffer |
| downloadDoubaoImageResponse | 16 | response 解析 |
| fetchWithTimeout | ~12 | fetch + AbortController |

**这 6 个方法零 repository/tasks 依赖**，只依赖入参（apiKey/baseUrl 从 settingsService 拿，但那是调用方做的，方法本身只接收值）。

调用方（generateCharacterReference / generateSceneReference）的链路：
```
调用方 → settingsService.getRuntimeImageProviderSettings() 拿 apiKey/baseUrl
       → this.requestDoubaoImage({apiKey, baseUrl, ...}) 或 requestOpenAiImage
       → 拿到 Buffer
```

### 2.3 有状态编排层（依赖 repository/tasks/queue，~15 个）

generateCharacterReference(129) / queueSceneReference(60) / generateSceneReference(80) / queueCharacterReference(40) / confirmCharacterPreview(45) / confirmCharacterReference(44) / deleteCharacterReference(57) / resolveImagePreflightCharacter(107) / queueCharacterReferenceTask(47) / runCharacterReferenceTask(34) / runSceneReferenceTask(26) / enqueueCharacterReferenceTaskRun(14) / enqueueSceneReferenceTaskRun(14) / hasActiveCharacterReferenceTask(11) / queueMissingCharacterReferenceTask(20)

## 3. 循环依赖的本质与解法

### 3.1 本质

```
角色编排方法（generateCharacterReference 等）
  → 需要出图（requestDoubaoImage / requestOpenAiImage）
  → requestImage 是 Service 的私有方法（和编排方法同在一个 class）
```

如果把"角色编排"抽成独立 Service，它需要调出图，但出图方法在原 Service 里 → 角色编排 Service 反向依赖原 Service → 循环。

### 3.2 解法：先抽出图网关

把 6 个出图方法抽成 `ImageProviderService`（独立 Nest service），注入 settingsService，对外提供：
- `generateImage(prompt, size, options) → Buffer`（内部按 provider 类型分流 doubao/openai）
- `editImage(prompt, referenceImage, size, options) → Buffer`

角色编排方法改调 `this.imageProvider.generateImage(...)`，不再自己拿配置 + 选 provider。

### 3.3 抽 ImageProvider 后的依赖图（无环）

```
ProjectsService（角色编排）
  → ImageProviderService（出图，单向）
  → ProjectRepository（持久化）
  → TasksService（任务队列）
```

ImageProviderService 不依赖 ProjectsService → **循环打破**。

## 4. 本轮范围（精确）

**阶段 1：抽 ImageProviderService（打破循环依赖的前提）**
- 6 个出图方法 + provider 配置解析（getRuntimeImageProviderSettings + baseUrl 兜底逻辑）→ ImageProviderService。
- 对外：`generateImage` / `editImage`，内部按 settings.type 分流 doubao/openai。
- Service 注入 ImageProviderService，generateCharacterReference/generateSceneReference 改调它。

**阶段 2：抽纯函数到 character-domain.util（补遗）**
- extractCharactersFromProjectSource / withUpdatedProjectCharacter / buildStoryStructureCharacterPrompt / resolveCardLevel / resolveMoreImportantCharacterLevel / getDefaultRoleForLevel 等剩余纯函数补抽。

**阶段 3：验证 + Scrutiny**

## 5. 不做的事（本轮边界）

- **不抽 CharacterReferenceService**（把所有角色编排方法整体搬走）：那需要改调用面（ToolCallback/Controller 改 import），且 ADR-0005 门面约束。先做 ImageProvider 解耦，角色编排整体搬走留下一轮。
- **不改 ADR-0005 调用面**：Controller/ToolCallback 仍调 ProjectsService 的薄门面方法。

## 6. 风险与回滚

| 风险 | 应对 |
| --- | --- |
| ImageProvider 接口设计与现有调用不匹配 | 先完整读 generateCharacterReference/generateSceneReference 的出图调用链，确保接口覆盖所有分支（doubao/openai × image/edit） |
| provider 配置读取逻辑迁移遗漏 | getRuntimeImageProviderSettings 调用点全替换；typecheck 兜底 |
| fetchWithTimeout 被非出图代码引用 | grep 确认调用点（预计只在出图方法内） |
| 回滚 | 每阶段独立 commit |

## 7. 退出标准

1. ImageProviderService 抽出，6 出图方法迁出。
2. generateCharacterReference/generateSceneReference 改委托。
3. Service 行数下降（预计 -200 行）。
4. typecheck 三包 + 61 tests 全绿（不新增 e2e，靠现有契约保证行为等价）。
5. Scrutiny 复核通过。

## 8. 范围调整：阶段 2 推迟（2026-06-24 Orchestrator 决定）

原计划阶段 2 补抽角色纯函数（syncStoryStructureCharacters 125 行 + extractCharactersFromProjectSource 55 行等）到 character-domain.util。

**决定推迟到下一轮**，理由：
- 本轮核心目标（打破循环依赖）已由 ImageProviderService 达成。
- 剩余纯函数每个都小（4-19 行），抽取是机械工作，与上轮 script-import 模式一致但收益分散。
- 避免"一次做太多"导致风险叠加；纯函数抽取零行为风险，适合独立一轮做。

## 9. Scrutiny Review 静态复核结论（2026-06-24）

**结论：通过。**

### 9.1 拆分契约验证

| 检查项 | 结果 |
| --- | --- |
| Service 行数 | 3518 → 3272（-246 行） |
| 新 ImageProviderService | 311 行 |
| typecheck 三包 | ✅ 全通过 |
| 全量 test | ✅ shared 15 + server 46 = 61 tests 全绿 |
| 出图方法从 Service 移除 | ✅ 0 残留（grep 确认） |
| this.request* 调用残留 | ✅ 0 处 |
| imageProvider 委托调用 | ✅ 5 处（generateCharacterReference + generateSceneReference） |

### 9.2 循环依赖打破验证

拆分前：角色编排 → 出图方法（同 class 私有方法），抽独立 service 会反向依赖 → 循环。
拆分后：角色编排（ProjectsService）→ ImageProviderService（单向）；ImageProviderService 只依赖 SettingsService，不依赖 ProjectsService → **无环**。

### 9.3 行为等价性

- 6 个出图方法逻辑体逐字迁移（仅去掉 private/this）。
- 配置校验（apiKey/baseUrl 缺失抛 IMAGE_PROVIDER_NOT_CONFIGURED）从两个调用点收口到 resolveProviderConfig（行为等价）。
- provider 分流（doubao/openai）从调用点移到 ImageProviderService 内部（调用方通过 getActiveProviderType 决定 size 差异）。
- model 兜底（`|| "gpt-image-2"` / `"doubao-seedream-4-5-251128"`）从 meta 记录中移除（modelId 现在由 ImageProviderService 内部使用，meta 不再记录具体 model——这是有意简化，model 不影响业务逻辑）。

### 9.4 残留风险

- asset meta 不再记录 `model` 字段（generateSceneReference）。这是可接受的简化——model 不影响业务逻辑，且原本记录的是兜底值。
- ImageProviderService 无独立单元测试（依赖 settingsService + 真实 HTTP，适合 e2e）。靠现有集成路径间接覆盖。
- 阶段 2（角色纯函数补抽）推迟到下一轮。
