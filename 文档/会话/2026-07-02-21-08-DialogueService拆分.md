# finding

## 拆分对象

`apps/server/src/dialogue/dialogue.service.ts` 共 3014 行,是全仓最大源文件。

## 结构事实(探索确认)

- **叶子服务**:只有 `DialogueController`(`dialogue.controller.ts:16`)注入它;无下游扩散。
- **依赖注入**:constructor 仅注入 `ProjectsService` + `OpenCodeRuntimeService`(`:125-130`)。
- **依赖方向单向**:`DialogueController → DialogueService → {ProjectsService, OpenCodeRuntimeService}`,projects/ 和 ai-runtime/ 不反向引用 dialogue,**无循环依赖风险**。
- **私有状态 6 个**(`:118-123`):`threads`/`activeStreamingAssistantMessageIds`(核心会话)+ `pendingScriptImports`/`pendingInspirationSeeds`/`pendingScriptOutlines`/`pendingStoryStructures`(各工作流 pending 缓冲)。
- **每个 pending* Map 只被一个 tryHandle* 工作流触碰**,彼此正交——这是拆分的关键接缝。
- **项目删除清理**:`onProjectDeleted` 回调 → `deleteProjectRuntimeState`(`:428-454`)触及全部 6 个 Map,拆分后由 DialogueService 编排各子 service 的 `clearForProject(id)`。

## 内部类型(:48-110)

`LocalDialogueThread` / `DialogueTurn` / `ScriptOrganizationInput` / `PendingScriptImport` / `PendingInspirationSeeds` / `PendingScriptOutline` / `PendingStoryStructure` → 抽到 `dialogue-types.ts`。

## 纯函数图谱(零风险可抽 util,~1400 行)

| 簇 | 代表方法 |
| --- | --- |
| 意图分类器 | shouldGenerate*/isConfirming*/isSelecting*/parseChineseOrder(~20个) |
| prompt 构造 | buildStoryStructurePrompt/buildStoryboardPrompt/buildInspirationSeedsPrompt/buildScriptOutline*/buildScriptFrom*/buildChapterEditingPrompt(8个) |
| JSON normalize/parse | normalizeStoryboardJson/normalizeStoryStructureJson/extractJsonPayload/parseInspirationSeeds + 子函数 |
| 文本/record 辅助 | stripMarkdownFence/ensureChapterMarkdown/compactPromptText/asRecord/getOptional*/getRecord* |
| key 派生 | getPendingInspirationKey/getPendingScriptOutlineKey/getPendingStoryStructureKey/getThreadKey |

## 门面委托模板(已验证,复用 ProjectsService 模式)

- `projects.service.ts:180-192`:constructor @Inject 多个子 service,公共方法变薄委托。
- `projects.module.ts:16-22`:子 service 平铺在 providers。
- 子 service 只注入底层 repository/store,**不注入 ProjectsService**(避免循环);dialogue 子 service 同理注入 ProjectsService+OpenCodeRuntimeService(它们已是底层依赖,无循环)。
- 类型循环用 `import type` 规避(编译时擦除)。

# web_search


# goal

把 `dialogue.service.ts` 从 3014 行拆到 ≤600 行,套用已验证的门面委托模式,6 轮推进,每轮 typecheck + 61 tests + 运行时验证 + 提交。

退出标准:service ≤600 行,typecheck 三包通过,61 tests 全绿,灵感/大纲/章节/结构/分镜对话链路运行时走通,文档同步。

# todo

- [ ] 轮次1: 抽类型 + 纯函数 util → service ~1650行
- [ ] 轮次2: 抽 ScriptDialogueService(剧本工具链) → service ~600行
- [ ] 轮次3: 抽 StoryStructureDialogueService → service ~450行
- [ ] 轮次4: 抽 StoryboardDialogueService → service ~350行
- [ ] 轮次5: 评估角色工具 + 收口编排
- [ ] 轮次6: 文档同步 + 完成记录 + 长期记忆
