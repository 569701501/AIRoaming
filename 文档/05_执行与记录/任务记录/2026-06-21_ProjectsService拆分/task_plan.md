# ProjectsService 巨石拆分

---
doc_id: AIR-TASK-PROJECTS-SERVICE-SPLIT
status: planning
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-21 架构深化评审(improve-codebase-architecture)
---

## 1. 目标

把 `apps/server/src/projects/projects.service.ts`(5236 行,占全部 service 54%,14 职责域)拆分为多个内聚 module,降低单文件复杂度,提升 locality / leverage / 可测试性 / AI 导航性。**纯收口重构,行为不变**。

## 2. 非目标

- 不改业务行为、数据结构、任务协议、文件路径。
- 不改调用面:Controller / DialogueService / ToolCallbackService 调 ProjectsService 的方式不变(ADR-0005 约束,ProjectsService 是业务枢纽)。
- 不一次性全拆:分批,每批独立验证 + 可回滚。
- 不改前端(本次纯后端)。
- 不动 DialogueService(3014 行,第二巨石,另立任务)。

## 3. 验收标准

- 每阶段后 `corepack pnpm -w typecheck` 三包通过。
- 现有关键流程不回归:项目创建 / 剧本与大纲 / 剧情结构 / 分镜 / 出图准备 / 候选图。
- ProjectsService 行数显著下降,子 service 内聚(单一职责)。
- 调用面零变更(Controller / Dialogue / ToolCallback 代码不变,或仅 import 调整)。
- Scrutiny Review 静态复核通过;Runtime/User Review 运行复核通过。

## 4. 阶段划分

### 阶段 0:基线与验证口径
- 确认测试现状(已确认:**无单测/e2e**)。
- 建立可回归验证基线:typecheck + 手动关键流程清单。
- 记录基线行数与职责分布。

### 阶段 1:抽 ProjectRepository(候选 A,首选)
- 收口:`ensureProjectsLoaded` / `loadProjectsFromWorkspace` / `readProject*` / `writeProjectFiles` / `writeChapterFiles` / `parseJsonRecord` / `getStringField` 等 + 散落 fs 调用。
- 内存缓存(`projects Map`)抽 ProjectStore 或留 ProjectsService(待 grill 决定)。
- ProjectsService 委托 Repository。
- 验证:typecheck + 流程。

### 阶段 2:抽 ImagePreflightService(候选 B)
- 收口:`confirmChapterImagePreflight` / `resolveImagePreflightCharacter` / `buildImagePreflightJson` / `buildImagePreflightStyleCheck` / `isChapterImagePreflightReady` / `resolveOrCreatePreflightCharacter` / `readChapterImagePreflight`。
- ProjectsService 委托(门面)。

### 阶段 3:抽 CharacterReferenceService(候选 C)
- 收口:角色/场景参考图生成方法 + prompt 构造。
- ADR-0005 约束:门面保留方法,ToolCallback/Controller 仍走 ProjectsService。
- 注意:若要让调用方直连子 service 需更新 ADR-0005(本次不做)。

### 阶段 4(可选):D ScriptImportAnalyzer / E WorkflowResolver
- 纯算法/状态机抽取,收益中等,视前 3 阶段效果与精力决定。

## 5. 风险

| 风险 | 应对 |
| --- | --- |
| 无测试保护,纯收口靠 typecheck + 手动 | 阶段 0 先建手动验证清单;每阶段小步 + typecheck |
| 内存缓存(`projects Map`)状态在 Repository/Service 间切分,引入不一致 | 明确缓存归属(grill 决定),Repository 只管读写,缓存留 Service 或独立 Store |
| 散落 fs 调用收口遗漏 → 文件没写/读错 | 收口时 grep 全部 fs 调用,逐一归属 |
| CharacterReference 抽取动调用面 → 违反 ADR-0005 | 门面委托,调用方不变;直连方案另开 ADR |
| 大重构一次性回滚成本高 | 每阶段独立 commit,可单独 revert |

## 6. 回滚

每阶段独立 commit。失败 → `git revert` 单阶段,不影响其他阶段与现状。

## 7. 退出标准

1. 阶段 1-3(或商定范围)执行完毕,`progress.md` 时间线完整。
2. typecheck 三包通过。
3. Scrutiny Review 静态复核通过(代码与 plan 一致、契约/路径未变、调用面未变)。
4. Runtime/User Review 运行复核通过(关键流程不回归)。
5. 文档同步:03 模块梳理新增子 service 边界;ADR 若调用面决策变化则新增。

## 8. 决策点(2026-06-21 grill 已定)

- **Q1 → Repository 内管缓存+fs**:`projects Map` + `ensureProjectsLoaded` + `load/save` 一起搬进 Repository,Repository 有状态(IdentityMap 式)。ProjectsService 变无状态纯领域。
- **Q2 → 粗 `loadProject`/`saveProject` + `saveChapter`**:匹配现状(全量缓存 + `writeChapterFiles` 单章),纯收口零改写策略。
- **Q3 → 门面保留委托**:阶段③ CharacterReferenceService 抽出后,ProjectsService 保留薄方法委托。不破 ADR-0005,调用方不变。
