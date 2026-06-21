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

### 子步 1b:抽 Repository 加载链+缓存(暂停,下次续)
- 读加载链(~490 行)完成。发现 normalize 依赖(findings §6):`normalizeStoryStructureJson`/`normalizeStoryboardJson` 业务共用 → 需 1b-pre-2 抽 domain util;`normalizeImagePreflightJson`(180行)/`normalizeProjectCharacter`/`parseScriptRevision`/`getOrderFromChapterSlug` 只加载链用 → 搬 Repository 私有。
- **下次会话续**:1b-pre-2(抽 normalize util)→ 1b(Repository:缓存+加载链+4 normalize)→ 1c(写入链)。
- 暂停点:1b-pre 完成(commit `282f678`),3 个子步独立、typecheck 过、行为不变,干净可回滚。

### 子步 1c:抽 Repository 写入链(待办)
