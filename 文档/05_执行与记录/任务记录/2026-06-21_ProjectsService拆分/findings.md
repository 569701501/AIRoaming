# 探索发现、证据、风险、问题与结论

## 1. 证据

### 1.1 规模
- `projects.service.ts`:5236 行(`wc -l`)。
- 占全部 service(7 文件 9694 行)54%。
- `projects/` 目录仅 3 文件(service/controller/module),单文件巨石。

### 1.2 职责域(14 个)
项目管理 / 章节管理 / 项目工作流 / 故事与剧情结构 / 角色与场景模板 / 分镜 / 出图准备 / 生成任务守卫 / 参考图生成 / 剧本导入分析 / 持久化 / 内存缓存 / 工作区快照 / normalize 辅助。

### 1.3 调用面(ADR-0005 约束)
- Controller:`projects.controller.ts`(270 行),~33 方法,覆盖几乎全部 public 表面。
- DialogueService:~13 方法,含 controller 不调的"AI 写入"(`analyzeScriptImport` / `importScriptToChapters` / `writeChapterDraftFromAI` / `saveScriptOutlineFromAI` / `ensureChapterExists`)——类型2伪工具,ADR-0005 决策保留。
- ToolCallbackService:~6 方法,类型1真工具委托。
- 注入依赖:`WorkspacePathService` / `TasksService` / `SettingsService`。

### 1.4 持久化现状
- 无 Repository / Persistence / Storage / Gateway 类。
- 结构化 JSON 读写集中在 `ensureProjectsLoaded` / `loadProjectsFromWorkspace` / `writeProjectFiles`。
- 非结构化 fs 调用散落(`writeFile` L574/L725、`readFile` L2448/L3703/L4634、`rm` L2057/L4655/L3558…)。

### 1.5 测试现状
- **无单测、无 e2e**(Glob `*.spec.ts` / `*.test.ts` 均无)。
- 验证只能靠 typecheck + 手动流程。

### 1.6 文档边界(模块总览 vs 实现 gap)
- 模块总览 §4.6 出图准备、§4.2.1 项目工作流、§4.4 角色与场景模板 均定义为独立模块,但代码全塞 ProjectsService。
- ADR-0005:ProjectsService 是业务枢纽,调用面不可拆。

## 2. 风险与问题

- 无测试:纯收口重构回归风险高,需手动验证清单。
- 内存缓存状态切分:`projects Map` 在 Repository/Service 间归属不清会引入不一致。
- 散落 fs 收口遗漏:文件 I/O 散落多处,收口时易遗漏。

## 3. 结论

- ProjectsService 是确凿巨石,该拆。
- 拆分聚焦内部实现分层(不动调用面),符合 ADR-0005。
- 首选抽 `ProjectRepository`(最大、最独立、解锁后续)。
- 验证靠 typecheck + 手动(无测试),需先建基线清单。
- 顺序:`ProjectRepository` → `ImagePreflightService` → `CharacterReferenceService` →(可选)纯算法/状态机。

## 4. 阶段①规模评估(2026-06-21 Worker 读码后)

### 4.1 调用点
- `this.projects` 用法:**33 处**(get/set/delete/values),模式高度一致(业务方法改对象后 `set` 回缓存)。
- Repository 相关方法调用:**254 处**。
- 但 254 多数是 `read*`/fs 辅助的**内部调用**(整体搬进 Repository 不改调用点)。
- 真正需改的 Service 直调点:`this.projects`(33)+ `ensureProjectsLoaded` + `writeProjectFiles` + `writeChapterFiles` + `clear*` + 业务方法直调的 `readChapter*` ≈ **50-80 处**。

### 4.2 关键发现:fs 辅助是通用 util
- `parseJsonRecord`/`getStringField`/`getOptionalStringField`/`getStringArrayField`/`getNumberField`/`readOptionalTextFile`/`readOptionalDirectory` 不只服务持久化——Service 业务方法解析 AI 输出 JSON 也用。
- 应抽独立 util(`workspace-json.ts`),Repository 和 Service 都可用,而非塞进 Repository。

### 4.3 阶段①实际含两个抽取
- ① fs/JSON 辅助 util(纯函数,低风险)
- ② Repository(缓存 + 加载链 + 写入链)
- 无测试,50-80 调用点,大重构风险高。

### 4.4 建议分子步
- **1a**:抽 util(fs/JSON 辅助),验证模式,低风险。
- **1b**:抽 Repository 加载链 + 缓存,Service 改 `projects.get/set` + `ensureLoaded`。
- **1c**:抽 Repository 写入链,Service 改 `writeProjectFiles` → `saveProject`。
- 每子步独立 commit + typecheck + 手动验证。

## 5. 阶段①子步1b 依赖评估(2026-06-21 Worker 读码后)

### 5.1 readChapter*/readProject* 只加载链内部用(利好)
- grep 确认:`readChapter*`/`readProject*`/`readPending*`/`readLatest*` 全部只在 `loadProjectsFromWorkspace`→`readProjectFromWorkspace`→`readChaptersFromWorkspace`→`readChapterFromWorkspace` 链内调用。业务方法从缓存 `project` 读,不直调。
- 所以 Repository public 只需 6 个缓存方法(`ensureLoaded`/`getProject`/`getAllProjects`/`setProject`/`deleteProject`/`hasProject`),加载链 13 个 read* 全 private。1b 调用点改动缩到 ~35 处(`this.projects` 33 + `ensureLoaded`)。

### 5.2 但 readProjectFromWorkspace 依赖业务共用辅助(新问题)
- `readProjectFromWorkspace` 依赖:`createDefaultChapter` / `sortChapters` / `normalizeProjectType`/`normalizeComicFormat`/`normalizeArtStyle` / `sortProjectCharacters` / `getCurrentChapter` / `extractChapterScriptName`(import)。
- grep 确认这些辅助被**业务方法大量调用**(不只加载链):`sortChapters` 在 ~20 处业务方法用,`normalize*` 在 createProject/updateProjectDraft 等用,`createDefaultChapter` 在多处业务用。
- 所以不能简单搬进 Repository(业务还要调)。

### 5.3 1b 需先抽 domain util
- 这些辅助(`sortChapters`/`sortProjectCharacters`/`normalize*`/`createDefaultChapter`/`getCurrentChapter`)是**纯函数**,本就该是 domain util(不属于 Service 状态)。
- 1b 拆:**1b-pre** 抽 domain util(纯函数)+ **1b** 搬加载链(Repository 用 domain util)。

## 6. 阶段①子步1b normalize 依赖发现(2026-06-22 Worker 读码后)

- 读加载链(~490 行,`ensureProjectsLoaded` → `readProjectFromWorkspace` → 各 `readChapter*`)发现还依赖 6 个 Service 方法:
  - `normalizeStoryStructureJson` / `normalizeStoryboardJson`:**业务 + 加载链共用**(updateChapterStoryStructure / confirmChapterStoryboard 等业务也调,grep 多处)→ 要抽 domain util(1b-pre-2)。
  - `normalizeImagePreflightJson`(180 行)/ `normalizeProjectCharacter` / `parseScriptRevision` / `getOrderFromChapterSlug`:**只加载链用**(grep 仅在加载链)→ 搬进 Repository 私有。
- 1b 实际含 **1b-pre-2**(normalize util:normalizeStoryStructureJson/normalizeStoryboardJson)+ **1b**(Repository:加载链 + 缓存 + 搬 4 个只加载链用的 normalize)。
- 深坑继续:每剥一层发现 normalize/类型/常量/函数依赖。Repository ① 是跨多次会话的超深工程。

## 7. 阶段①子步1b-pre-3 角色normalize 依赖发现(2026-06-22)

- `normalizeProjectCharacter`(加载链用)依赖一组角色 normalize:`normalizeCharacterLevel`/`Name`/`Status`/`ReferenceKind`/`EntityType`/`defaultReferenceKindForLevel`。
- grep 确认这组**业务 + 加载链大量共用**(~25 处:updateProjectCharacter / extractProjectCharacters / syncStoryStructureCharacters 等)→ 要抽 domain util(1b-pre-3)。
- **非纯函数问题**:`normalizeCharacterName`(4111) throw `BadRequestException("CHARACTER_NAME_REQUIRED")`。抽 domain util 要么让它 throw(领域层不该有 HTTP 异常),要么改 throw `Error` + Service catch 转 `BadRequestException`。**需设计决策**。
- 依赖常量 `characterLevels`/`characterStatuses`/`characterReferenceKinds`/`characterEntityTypes`(Service 本地 118-121)。
- `normalizeImagePreflightJson`(180 行)依赖未查,1b 主体时查。
- **下次会话续**:1b-pre-3(角色normalize domain util,处理非纯 throw)→ 1b(Repository 主体:缓存+加载链+4 私有 normalize+35 调用点)→ 1c(写入链)。
