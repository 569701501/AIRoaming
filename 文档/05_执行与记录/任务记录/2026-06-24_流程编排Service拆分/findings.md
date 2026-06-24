# 探索发现与方案拷问

---
doc_id: AIR-TASK-FLOWSVC-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
source: 任务 2026-06-24_流程编排Service拆分 Orchestrator 阶段
---

## 1. 目标

将 ProjectsService 剩余的 3 个流程编排各拆成独立 service:
- 剧情结构 → StoryStructureService
- 分镜 → StoryboardService
- 出图准备 → ImagePreflightService

拆完后 ProjectsService ≈ 860 行(门面委托 + 项目CRUD + workbench装配 + 通用辅助)。

## 2. 交叉耦合分析(决定性证据)

三域间交叉调用**只有一处**:
```
resolveImagePreflightCharacter(出图准备) → normalizeStoryboardJson(分镜)
```

其他全部是域内自调。耦合极易解:
- normalizeStoryboardJson 是纯薄委托(`return storyNormalize.normalizeStoryboardJson(...)`)
- resolveImagePreflightCharacter 改直接调 `storyNormalize.normalizeStoryboardJson`,不依赖 StoryboardService

结论:**三域可干净独立拆分,无跨 service 循环依赖。**

## 3. 各域方法清单

### 3.1 剧情结构(389 行 → StoryStructureService)

| 方法 | 行 | 域外依赖 |
| --- | --- | --- |
| confirmChapterStoryStructure | 38 | projectStore/repository/characterRef(sync角色) |
| updateChapterStoryStructure | 48 | projectStore/repository |
| syncStoryStructureCharacters | 125 | characterRef(角色辅助 6 个) |
| createChapterStoryStructure | 29 | - |
| buildStoryStructureCharacterPrompt | 11 | - |
| normalizeStoryStructureJson | 11 | storyNormalize |
| resolveCardEntityType | 8 | wsCharacter |
| resolveCardLevel | 11 | characterRef.inferCharacterLevel |
| assertChapterCanSaveStoryStructure | 10 | projectStore |
| getChapterStoryStructure | 8 | projectStore |

关键:syncStoryStructureCharacters 调 characterRef 的 6 个角色辅助(resolveCardLevel/inferCharacterLevel/normalizeCharacterName/resolveMoreImportantCharacterLevel/resolvePrimaryReferenceForLevel/resolveCharacterStatusForReference)。这些已在 CharacterReferenceService 改 public(第六轮)。StoryStructureService 注入 CharacterReferenceService 即可。

### 3.2 分镜(207 行 → StoryboardService)

| 方法 | 行 | 域外依赖 |
| --- | --- | --- |
| confirmChapterStoryboard | 36 | projectStore/repository |
| updateChapterStoryboard | 45 | projectStore/repository |
| savePendingChapterStoryboard | 33 | projectStore/repository |
| createChapterStoryboard | 29 | - |
| createPendingChapterStoryboard | 28 | - |
| normalizeStoryboardJson | 11 | storyNormalize |
| assertChapterCanSaveStoryboard | 10 | projectStore |
| getChapterStoryboard | 9 | projectStore |
| getPendingChapterStoryboard | 6 | projectStore |

最独立,零跨域耦合。

### 3.3 出图准备(286 行 → ImagePreflightService)

| 方法 | 行 | 域外依赖 |
| --- | --- | --- |
| resolveImagePreflightCharacter | 107 | projectStore/repository/characterRef/storyNormalize(唯一的跨域) |
| confirmChapterImagePreflight | 53 | projectStore/repository/characterRef |
| normalizeImagePreflightJson 系列(6个) | ~118 | imagePreflightUtil(已是 util) |
| getChapterImagePreflight | 8 | projectStore |

normalizeImagePreflight* 6 个薄委托:直接删,改调 imagePreflightUtil。
resolveImagePreflightCharacter 的 normalizeStoryboardJson 改调 storyNormalize。

## 4. 拆分顺序(低风险→高风险)

| 顺序 | service | 行数 | 风险 | 理由 |
| --- | --- | --- | --- | --- |
| 1 | StoryboardService | 207 | 低 | 最独立,零跨域 |
| 2 | StoryStructureService | 389 | 中 | syncStoryStructureCharacters 调 characterRef |
| 3 | ImagePreflightService | 286 | 中 | resolveImagePreflightCharacter 跨分镜(已解:改调 storyNormalize) |

## 5. 门面委托

每个 service 的公开方法(被 Controller/DialogueService 调用)在 ProjectsService 保留薄委托:
- 分镜:confirmChapterStoryboard/updateChapterStoryboard/savePendingChapterStoryboard/getChapterStoryboard/getPendingChapterStoryboard
- 结构:confirmChapterStoryStructure/updateChapterStoryStructure/getChapterStoryStructure
- 出图:confirmChapterImagePreflight/getChapterImagePreflight/resolveImagePreflightCharacter

## 6. 风险与回滚

| 风险 | 应对 |
| --- | --- |
| syncStoryStructureCharacters 调 characterRef 6 方法 | 已 public(第六轮),注入即可 |
| resolveImagePreflightCharacter 改 storyNormalize 直接调 | 纯函数,typecheck 兜底 |
| guardGenerationTaskCreate 调 isChapterImagePreflightReady | 留 Service,改调 imagePreflightUtil |
| 门面委托遗漏 | grep 调用面兜底 |
| 回滚 | 每阶段独立 commit |

## 7. 退出标准

1. 三个 service 抽出。
2. Service 降到 ~860 行。
3. typecheck + test 全绿。
4. 调用面不变(ADR-0005)。
5. Scrutiny 通过。

## 8. Scrutiny 结论 + 运行时 bug 发现(2026-06-24)

### 8.1 拆分结果

| service | 行数 | 职责 |
| --- | --- | --- |
| StoryboardService | 254 | 分镜编排 |
| StoryStructureService | 354 | 剧情结构编排 |
| ImagePreflightService | 346 | 出图准备编排 |
| ProjectsService | 930 | 门面委托+CRUD+workbench装配+通用辅助 |

typecheck 三包通过;61 tests 全绿;调用面不变。

### 8.2 运行时发现:ProjectStore 空字符串死循环 bug

迁移后运行时验证发现第一章 sourceText 又变 0。诊断根因:

**ensureDefaultChapterReady 的 ?? 对空字符串不兜底**:
```typescript
// 原代码(line 90):
const sourceText = chapterSourceText ?? defaultChapter.sourceText ?? project.sourceText;
//                                                ^^
// chapterSourceText = ''(空文件读出的空字符串)
// '' ?? x → ''(空字符串不触发 ?? 兜底)
// → sourceText = '' → 写回 chapter.json → script.md = '' → 死循环
```

修复:改用显式空判断(trim 后为空才回退)。这个 bug 与拆分无关,是 ?? 运算符的固有缺陷,被运行时验证暴露。

### 8.3 残留风险

- 新三个 service 无独立单测。
- resolveImagePreflightCharacter 改调 storyNormalize.normalizeStoryboardJson(纯函数,行为等价)。
- guardGenerationTaskCreate 调 imagePreflightUtil.isChapterImagePreflightReady(留 Service)。
