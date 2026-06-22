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

### 子步 1c:抽 Repository 写入链(阻塞,依赖候选 E)
- 写入链(`writeProjectFiles`/`writeChapterFiles`/`clearProjectChaptersDir`/`clearLegacyStoryDir`)依赖 `buildProjectWorkflow`(工作流状态机,候选 E)+ `toChapterDetail`(业务方法)。
- 强行搬进 Repository 会引入 Repository→Service 反向依赖。**1c 需先抽 `buildProjectWorkflow`/`toChapterDetail` 成独立 util**(候选 E 工作流状态机 + toChapterDetail)。
- 1c 搁置,待候选 E 启动后一并处理。

### 阶段①总结(2026-06-22)
- Repository ① 主体(缓存+加载链)完成,纯收口,行为不变。
- projects.service.ts:~5236 → ~4440 行(-796)。
- 抽出 6 个独立文件:workspace-json.util / local-types / project-domain.util / story-normalize.util / character-domain.util / project-repository.service。
- 1c(写入链)阻塞于候选 E(工作流状态机),记录待续。
