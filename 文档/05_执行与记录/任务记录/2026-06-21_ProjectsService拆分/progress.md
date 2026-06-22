# 进度时间线

## 阶段 0:基线(2026-06-21)
- 测试现状:**无单测/e2e**(Glob `*.spec.ts`/`*.test.ts` 均无)。验证靠 typecheck + 手动关键流程。
- 基线行数:`projects.service.ts` 5236 行。
- 基线 typecheck:三包通过(已验证)。
- 手动验证清单(每阶段后跑):项目创建 → 剧本/大纲 → 剧情结构 → 分镜 → 出图准备 → 候选图。

## 阶段 1:抽 ProjectRepository(进行中)

### 子步 1a:抽 fs/JSON 辅助 util(2026-06-21 完成)
- 新建 `apps/server/src/projects/workspace-json.util.ts`,导出 `readOptionalTextFile` / `readOptionalDirectory` / `parseJsonRecord` / `getStringField` / `getOptionalStringField` / `getStringArrayField` / `getNumberField` / `isNotFoundError`。
- ProjectsService `import * as wsJson`,8 个 private 方法改为薄委托(零调用点改动)。
- 踩坑:NodeNext ESM 要求相对 import 带 `.js` 扩展名(`./workspace-json.util.js`),首次 typecheck 报 `Cannot find module`,加 `.js` 后通过。
- typecheck 三包通过。行为不变(纯委托)。

### 子步 1b-pre-0:抽 LocalChapter/LocalProject 类型(2026-06-21 完成)
- 新建 `apps/server/src/projects/local-types.ts`,把 `LocalChapterScriptVersion`/`LocalChapter`/`LocalProject` 从 projects.service 抽出。
- 为 domain util / ProjectRepository 解决循环依赖(类型共享)。确认这三个类型无外部 import,安全抽。
- typecheck 三包通过,行为不变。

### 子步 1b-pre-1:抽 domain util(2026-06-21 完成)
- 新建 `apps/server/src/projects/project-domain.util.ts`,导出 sortChapters/sortProjectCharacters/normalizeProjectType/normalizeComicFormat/normalizeArtStyle/normalizeChapterStatus/createDefaultChapter/getCurrentChapter + 常量 CHARACTER_LEVEL_ORDER/DEFAULT_CHAPTER_ID/SLUG/TITLE/getDefaultChapterTitle。
- ProjectsService 8 个 private 方法改薄委托 + 常量改 import(零调用点,行为不变)。
- typecheck 三包通过。

### 子步 1b-pre-2:抽 story normalize util(2026-06-22 完成)
- 新建 `apps/server/src/projects/story-normalize.util.ts`,把 normalizeStoryStructureJson+Characters/Scenes/Beats + normalizeStoryboardJson+Shots/Shot(7 个)从 projects.service 抽出。
- Service 2 个业务入口(normalizeStoryStructureJson/normalizeStoryboardJson)薄委托,5 个内部方法删除(搬走)。
- typecheck 三包通过,行为不变。

### 子步 1b-pre-3:抽角色 normalize domain util(2026-06-22 完成)
- 新建 `apps/server/src/projects/character-domain.util.ts`,normalizeCharacterLevel/Status/ReferenceKind/EntityType/Name/defaultReferenceKindForLevel + 常量抽出。
- normalizeCharacterName 保持 throw `BadRequestException`(domain util import @nestjs/common,保持 400 行为)。
- typecheck 三包通过,行为不变。
- **Repository 依赖全清**:fs / 类型 / domain / story normalize / 角色 normalize 都独立。加载链只剩 4 个只加载链用方法(normalizeImagePreflightJson/normalizeProjectCharacter/parseScriptRevision/getOrderFromChapterSlug)→ 搬 Repository 私有。

### 子步 1b:建 Repository 主体(2026-06-22 完成)
- 新建 `apps/server/src/projects/project-repository.service.ts`(~680 行):缓存状态 + 6 public(ensureLoaded/getProject/getAllProjects/setProject/deleteProject/hasProject)+ 加载链 13 方法 + 4 私有 normalize。
- projects.module.ts 注册 ProjectRepository provider。
- ProjectsService 注入 `@Inject(ProjectRepository) repository`,删缓存字段 + 加载链块(~490 行)+ 4 私有 normalize,保留 `ensureProjectsLoaded()` 薄委托。
- 34 处 `this.projects.xxx` → `repository.{setProject/getProject/deleteProject/hasProject/getAllProjects}`(语义命名)。
- label 函数抽进 project-domain.util(1b-pre-1 延伸),Service 薄委托。
- typecheck 三包通过。projects.service.ts ~5236 → ~4452 行(-784)。
- 已知清理项:Service 可能残留未使用 import(加载链删后),tsc 未报(noUnusedLocals 未开),后续清理。

### 子步 1b-clean:清理 Service 残留 import(2026-06-22 完成)
- 删除加载链删后未使用的 import:`readdir`(node:fs/promises)+ `ART_STYLES`/`CHAPTER_STATUSES`/`COMIC_FORMATS`/`PROJECT_TYPES`(@airoaming/shared)。
- 保留:readFile(getProjectAssetFile 用)/extractScriptOutlineTitle(writeScriptOutline 用)/extractChapterScriptName|Title。
- typecheck 三包通过。

### 候选 E:抽工作流状态机(2026-06-22 完成)
- 新建 `workflow.util.ts`:buildProjectWorkflow + 内部方法组(resolve/toWorkflowStep/Summary/Done/Waiting/Evidence)。
- isChapterImagePreflightReady 留 Service(依赖 buildImagePreflightJson 候选②),buildProjectWorkflow 接受 isPreflightReady 参数。
- Service 删工作流方法组(~170行)+ workflowStepOrder 常量 + 2 import,buildProjectWorkflow 委托。
- typecheck 三包通过。解锁 1c。

### toChapter 抽取(2026-06-22 完成,1c 前置)
- toChapterDetail/toChapterListItem/toChapterScriptVersionItem 抽进 project-domain.util.ts(纯函数,业务共用 10+ 处)。
- Service 3 方法薄委托。

### 子步 1c:搬写入链进 Repository(2026-06-22 完成)
- Repository 加 public:saveProject(project, workflow)/clearProjectChaptersDir/clearLegacyStoryDir + private writeChapterFiles。
- saveProject 接受 workflow 参数(由 Service 算好传入,因 workflow 依赖 buildImagePreflightJson 业务判断)。
- Service 删 writeProjectFiles/writeChapterFiles/clear*(~120行),writeProjectFiles 改委托(算 workflow + 调 saveProject),clear* 委托。
- typecheck 三包通过。

### 阶段①完成总结(2026-06-22)
- Repository ① 全部完成:缓存 + 加载链 + 写入链 收口到 ProjectRepository。
- projects.service.ts:~5236 → ~4133 行(−1103 行)。
- 纯收口,行为不变,调用面不变(ADR-0005 不破)。

### 候选 B:抽出图准备纯逻辑(2026-06-22 完成)
- 新建 `image-preflight.util.ts`:buildImagePreflightJson/isChapterImagePreflightReady/buildImagePreflightStyleCheck/getShotCharacterTokens/resolveStoryboardCharacterIds/resolveOrCreatePreflightCharacter。
- buildImagePreflightJson/isChapterImagePreflightReady 接受 isReferenceTaskRunning 回调(避免依赖 tasksService)。
- character-domain.util 补 normalizeCharacterNameKey/getDefaultRoleForLevel/isRequiredPreflightReferenceCharacter/isPrimaryReferenceCompatible。
- Service 删 10 个方法,confirm/resolve/getChapterImagePreflight 留 Service(深度依赖 Service 状态,门面)。
- typecheck 三包通过。

### 候选 C:抽参考图 prompt 构造 + asset 解析(2026-06-22 完成)
- 新建 `reference-prompt.util.ts`:buildCharacterReferencePrompt/buildCharacterReferenceStyleGuide/buildScenePrompt/getProjectTypeLabel/getAssetCreatedAt/getAssetReferenceKind。
- 参考图生成的状态编排(queue/run/confirm/delete)留 Service(依赖 tasksService/settingsService/repository/fetch)。
- Service 删 6 个纯函数方法,调用点改 util。
- typecheck 三包通过。

### 整个拆分工程完成总结(2026-06-22)
- projects.service.ts:**~5236 → ~3721 行(−1515 行)**。
- 抽出 **9 个独立文件**:
  - workspace-json.util / local-types / project-domain.util / story-normalize.util / character-domain.util(领域纯函数与类型)
  - workflow.util(工作流状态机)/ image-preflight.util(出图准备纯逻辑)/ reference-prompt.util(prompt 构造)
  - project-repository.service(缓存+加载链+写入链)
- 纯收口,行为不变,调用面不变(ADR-0005 不破)。
- 候选 D(剧本导入分析纯算法)未单独抽——它在 Service 内聚度高、调用面单一,收益中等,留作后续按需。
- 验证:typecheck 三包通过(无单测/e2e,需用户 runtime 验证关键流程不回归)。
