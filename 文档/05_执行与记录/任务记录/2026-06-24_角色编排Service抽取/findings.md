# 探索发现与方案拷问

---
doc_id: AIR-TASK-CHARREF-SVC-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_角色编排Service抽取 Orchestrator 阶段
---

## 1. 背景

第三轮已抽出 ImageProviderService 打破循环依赖。现在可以把角色参考图编排整体搬走了。Service 当前 3272 行,角色编排块约 644 行。

## 2. 外部调用面分析(ADR-0005 门面约束)

角色/场景方法被 Controller/ToolCallback/DialogueService 调用的完整列表:

**Controller 调用**:listProjectCharacters / ensureProjectCharacterPreviewTasks / extractProjectCharacters / updateProjectCharacter / queueSceneReference / queueCharacterReference / confirmCharacterPreview / confirmCharacterReference / deleteCharacterReference / resolveImagePreflightCharacter / getProjectAssetFile

**ToolCallback 调用**:listProjectCharacters / extractProjectCharacters / queueCharacterReference / queueSceneReference

结论:这些方法**必须保留在 ProjectsService 作为薄委托**(ADR-0005 门面约束,调用面不变)。

## 3. 方案:门面委托模式

```
Controller/ToolCallback/DialogueService
    ↓ 调用面不变
ProjectsService(薄门面)
    ↓ async foo() { return this.characterRef.foo() }
CharacterReferenceService(真实逻辑)
    ↓ 依赖
ProjectRepository / TasksService / ImageProviderService / WorkspacePathService
```

ProjectsService 保留 ~12 个薄委托方法(每个 ~3 行),角色编排真实逻辑(644 行)整体搬入 CharacterReferenceService。

## 4. 哪些搬走,哪些留门面

### 4.1 搬入 CharacterReferenceService(真实逻辑)

编排方法(644 行):
- listProjectCharacters / ensureProjectCharacterPreviewTasks / extractProjectCharacters
- updateProjectCharacter / generateCharacterReference / queueSceneReference / generateSceneReference
- queueCharacterReference / confirmCharacterPreview / confirmCharacterReference / deleteCharacterReference
- resolveImagePreflightCharacter

内部辅助方法(配套搬走):
- queueMissingCharacterReferenceTask / queueCharacterReferenceTask / enqueueCharacterReferenceTaskRun / enqueueSceneReferenceTaskRun
- runCharacterReferenceTask / runSceneReferenceTask / hasActiveCharacterReferenceTask
- getConfirmedPreviewReferenceSource / findProjectCharacter / withUpdatedProjectCharacter
- toProjectCharactersResponse / extractCharactersFromProjectSource / parseCharacterLine / extractMainCharactersSection / inferCharacterLevel

### 4.2 留 ProjectsService(薄委托)

12 个门面方法,签名不变,内部委托 characterRef。

### 4.3 不动的

- syncStoryStructureCharacters(剧情结构角色同步,属于结构确认流程,留 Service)
- 角色纯函数(normalize*/resolve* 等):多数已在 character-domain.util,剩余的跟着编排逻辑搬或在 util

## 5. 循环依赖复查

CharacterReferenceService 依赖:repository / tasksService / imageProvider / workspacePathService / characterReferenceQueue。
- 这些都不反向依赖 ProjectsService → 无环。
- characterReferenceQueue 是私有状态,搬到 CharacterReferenceService 内部。
- syncStoryStructureCharacters 留 Service(它调角色 normalize 但不调出图),CharacterReferenceService 不需要它。

## 6. 风险与回滚

| 风险 | 应对 |
| --- | --- |
| 门面委托遗漏(Controller 调用面断裂) | 全量 grep 确认 12 个方法签名不变 |
| 内部辅助方法搬走后 Service 还有残留引用 | typecheck 兜底 |
| characterReferenceQueue 状态迁移 | 搬到新 service 私有字段,ProjectsService 不再持有 |
| generateCharacterReference 没有外部调用面? | 核实——Controller 可能不直接调,但 updateAndGenerate 链路要用 |

## 7. 退出标准

1. CharacterReferenceService 抽出,~644 行逻辑迁入。
2. ProjectsService 保留 12 个薄委托。
3. Service 行数显著下降(预计 3272 → ~2700)。
4. typecheck + test 全绿。
5. 调用面不变(ADR-0005)。
6. Scrutiny 通过。

## 8. 关键发现:writeProjectFiles 核心耦合(2026-06-24 Orchestrator 暂停)

深入精读后发现角色编排与 Service 核心骨架深度耦合,无法干净整体搬走:

### 8.1 getReadyProject / writeProjectFiles 是 71 处调用的核心骨架

这两个方法被 Service 内 71 处调用(章节/结构/分镜/角色/出图准备全部用)。它们是项目读写的统一入口,不能轻易改动归属。

### 8.2 writeProjectFiles 反向依赖角色方法

```typescript
private async writeProjectFiles(project) {
  const workflow = workflowUtil.buildProjectWorkflow(project, currentChapter,
    imagePreflightUtil.isChapterImagePreflightReady(project, currentChapter,
      (pid, cid) => this.hasActiveCharacterReferenceTask(pid, cid, "final_reference")));
  //                                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  //                                              角色方法嵌入项目写入链路
  await this.repository.saveProject(project, workflow);
}
```

`writeProjectFiles` 构造 workflow 时,通过回调调 `hasActiveCharacterReferenceTask`(角色参考图任务查询)。如果角色方法搬走,这个回调断链。

### 8.3 角色编排方法深度依赖 Service 骨架

generateCharacterReference / updateProjectCharacter / extractProjectCharacters 等都调:
- `this.getReadyProject`(读项目)
- `this.writeProjectFiles` + `this.repository.setProject`(写项目)
- `this.assertProjectStillActive`(活跃性校验)
- 一堆角色 normalize 薄委托(this.normalizeCharacterName 等)

搬走后要么 CharacterReferenceService 重复实现 getReady/write(逻辑重复),要么反向依赖 ProjectsService(循环)。

### 8.4 决策:本轮暂停整体搬走

强行搬走 CharacterReferenceService 会:
1. 触碰 writeProjectFiles 的核心耦合(hasActiveCharacterReferenceTask 回调)。
2. 重复或反向依赖 getReadyProject/writeProjectFiles。
3. 风险大于收益(已 3272 行,核心骨架耦合是真实架构约束)。

**本轮暂停**。正确的下一轮应该:
- 先抽 `ProjectStore`/`ProjectLifecycleService`(收口 getReadyProject/writeProjectFiles/ensureDefaultChapterReady 等骨架),让所有编排 service 共享。
- 骨架独立后,角色编排才能干净搬走(依赖 ProjectStore 而非 ProjectsService)。

这是更深的架构改造,不该在这一轮仓促做。

## 9. 结论

本轮 Orchestrator 探索发现:角色编排与 Service 骨架深度耦合(writeProjectFiles 反向依赖角色方法),整体搬走风险过高。**暂停执行,记录发现供下一轮**。

前三轮拆分已将 Service 从 5236 → 3272 行(减 1964 行),抽出了 Repository + ImageProviderService + 8 个 util,并建立了 61 个测试。进一步的拆分需要先解骨架耦合(ProjectStore),属于架构层面的更大改造。
