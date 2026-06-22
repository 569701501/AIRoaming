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

### 子步 1b-pre-3:抽角色 normalize domain util(待办,下次续)
- `normalizeProjectCharacter` 依赖角色normalize组(`normalizeCharacterLevel`/`Name`/`Status`/`ReferenceKind`/`EntityType`/`defaultReferenceKindForLevel`),业务共用 ~25 处。
- **非纯**:`normalizeCharacterName` throw `BadRequestException`,需处理(见 findings §7)。
- 依赖常量 `characterLevels`/`characterStatuses`/`characterReferenceKinds`/`characterEntityTypes`。

### 子步 1b:抽 Repository 加载链+缓存(待办,依赖大部分已清空)
- 加载链依赖已大部分独立:1a fs、1b-pre-0 类型、1b-pre-1 domain、1b-pre-2 story normalize。1b-pre-3 完成后全清。
- 加载链剩余 4 个只加载链用方法(`normalizeImagePreflightJson` 180行/`normalizeProjectCharacter`/`parseScriptRevision`/`getOrderFromChapterSlug`)→ 搬 Repository 私有。
- 下一步:1b-pre-3 → 建 `ProjectRepository`(缓存+加载链+4 方法)→ 改 ~35 调用点。
- **暂停点(2026-06-22)**:1b-pre 完成(4 commit:`09d1455`/`454b3a1`/`282f678`/`a032701`),干净可回滚。下次会话续 1b-pre-3 + 1b。

### 子步 1c:抽 Repository 写入链(待办)
