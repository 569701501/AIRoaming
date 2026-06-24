# 探索发现与方案拷问

---
doc_id: AIR-TASK-CHARREF-SVC2-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_角色编排Service抽取第二轮 Orchestrator 阶段
---

## 1. 背景

第四轮(暂停)发现角色编排与骨架循环耦合无法搬走。第五轮抽 ProjectStore 解开了耦合。现在骨架独立,角色编排可干净依赖 ProjectStore,本轮执行抽取。

## 2. 依赖图(骨架独立后)

12 个编排方法(644 行)依赖:`projectStore`(已独立)+ `repository` + `imageProvider`(已独立)+ `tasksService` + `settingsService` + `workspacePathService`。

**无反向依赖 ProjectsService 的循环**。CharacterReferenceService 可直接注入这 6 个依赖。

## 3. 范围:门面委托模式(ADR-0005)

12 个编排方法是 Controller/ToolCallback 调用面,必须在 ProjectsService 保留薄委托。

```
Controller/ToolCallback → ProjectsService(薄门面) → CharacterReferenceService(真实逻辑)
                                                    ↓ 依赖
                         ProjectStore / Repository / ImageProvider / Tasks / Settings / WorkspacePath
```

## 4. 搬入 CharacterReferenceService 的方法

### 4.1 编排方法(12 个,644 行)
listProjectCharacters / ensureProjectCharacterPreviewTasks / extractProjectCharacters / updateProjectCharacter / generateCharacterReference / queueSceneReference / generateSceneReference / queueCharacterReference / confirmCharacterPreview / confirmCharacterReference / deleteCharacterReference / resolveImagePreflightCharacter

### 4.2 内部辅助(~15 个)
enqueueSceneReferenceTaskRun / runSceneReferenceTask / toProjectCharactersResponse / queueMissingCharacterReferenceTask / queueCharacterReferenceTask / enqueueCharacterReferenceTaskRun / runCharacterReferenceTask / hasActiveCharacterReferenceTask / getCharacterReferenceAssets / extractCharactersFromProjectSource / parseCharacterLine / extractMainCharactersSection / inferCharacterLevel / findProjectCharacter / withUpdatedProjectCharacter / getConfirmedPreviewReferenceSource

### 4.3 characterReferenceQueue 私有状态
搬到 CharacterReferenceService 内部(串行队列)。

### 4.4 不搬的
- syncStoryStructureCharacters(剧情结构确认流程,非角色库编排)
- buildStoryStructureCharacterPrompt(结构 prompt,同上)
- 角色纯函数薄委托(normalizeCharacterName 等,留 Service 给 syncStoryStructureCharacters 用)

## 5. 关键约束:hasActiveCharacterReferenceTask 留哪里?

第五轮 ProjectStore 通过 referenceTaskChecker 回调调它。如果搬到 CharacterReferenceService,ProjectsService.onModuleInit 的绑定要改成转发到 CharacterReferenceService.hasActiveCharacterReferenceTask。

但更简单:**hasActiveCharacterReferenceTask 搬到 CharacterReferenceService**,ProjectsService.onModuleInit 改绑:
```
projectStore.setReferenceTaskChecker((pid,cid,kind) => characterRef.hasActiveCharacterReferenceTask(pid,cid,kind))
```

## 6. 风险与回滚

| 风险 | 应对 |
| --- | --- |
| 27 个方法迁移,工作量大易错 | 分步:先搬内部辅助+编排,逐个 typecheck |
| 门面委托遗漏 | 全量 grep 调用面 |
| 角色纯函数薄委托残留(syncStoryStructure 用) | 保留 Service 内 normalize* 薄委托 |
| characterReferenceQueue 状态迁移 | 搬到 CharacterReferenceService 私有字段 |

## 7. 退出标准

1. CharacterReferenceService 抽出,~900 行迁入。
2. ProjectsService 保留 12 个薄委托门面。
3. Service 行数显著下降(预计 3184 → ~2400)。
4. typecheck + test 全绿。
5. 调用面不变(ADR-0005)。
6. Scrutiny 通过。

## 8. 执行评估与决策:本轮分两子轮(2026-06-24)

### 8.1 迁移规模评估

Agent 探索确认完整迁移规格:
- 13 个公开编排方法(门面委托)
- 18 个私有辅助方法
- 13 个角色纯函数薄委托
- characterReferenceQueue 私有状态
- 2 个内部类型(ProjectAssetFile/CharacterReferenceSource)
- 跨服务辅助依赖:getErrorMessage/inferMimeType/isNotFoundError/toChapterDetail/normalizeStoryboardJson/getCurrentChapter

合计 ~1000 行,31 个方法。这是迄今最大的单轮迁移。

### 8.2 风险评估

- 单次生成 1000+ 行 service 文件,精确搬运每个方法体并改 this 引用,出错概率高。
- 跨服务辅助方法(getErrorMessage/inferMimeType 等)需要额外处理:要么搬走、要么改注入。
- typecheck 修复循环可能很长(31 个方法的引用断裂点)。
- 在当前会话(已 6 轮拆分)的长上下文下执行,可靠性下降。

### 8.3 决策:拆成两个子轮,本轮先做架构确认

本轮(第六轮)的价值已经通过第五轮(ProjectStore)达成——**循环依赖已解开**,这是架构层面的关键突破。CharacterReferenceService 的整体搬运是"代码组织优化",架构价值递减。

决定:
- 本轮保留为"迁移规格已就绪"状态(Agent 已产出完整规格)。
- CharacterReferenceService 实际抽取在新会话(干净上下文)执行,基于已就绪的规格,可靠性更高。
- 不在当前长上下文仓促执行高风险大迁移。

## 9. 已就绪的迁移规格(供下一轮执行)

Agent 已产出完整迁移规格(方法清单/行号/签名/依赖/委托目标/类型/队列状态),存储在本任务目录的探索记录中。下一轮可直接基于此执行,无需重新探索。

关键点:
- 新服务注入 6 依赖:ProjectStore/Repository/ImageProvider/Tasks/Settings/WorkspacePath。
- hasActiveCharacterReferenceTask 搬到新服务,ProjectsService.onModuleInit 的 referenceTaskChecker 改转发。
- 跨服务辅助(getErrorMessage/inferMimeType/isNotFoundError)建议也搬走或抽 util。
- resolveImagePreflightCharacter 依赖 normalizeStoryboardJson/toChapterDetail,需特殊处理(可能留门面或改 ProjectStore 暴露)。
