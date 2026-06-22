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

### 子步 1b:建 Repository 主体(待办,依赖全清,建议新会话)
- 加载链依赖全清。建 `ProjectRepository`(缓存 + 加载链 490 行 + 4 私有 normalize + 6 public)+ 改 ~35 调用点(this.projects 33 + ensureProjectsLoaded)。
- 超大工程(~700 行 Repository + 35 调用点),建议新会话 context 充足时一次做完。

### 子步 1c:抽 Repository 写入链(待办)
