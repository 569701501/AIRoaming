# 探索发现与方案拷问

---
doc_id: AIR-TASK-PROJSPLIT2-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_ProjectsService拆分第二轮 Orchestrator 阶段
---

## 1. 现状基线

- `projects.service.ts` 当前 **3730 行**,151 个方法。
- 上轮拆分(2026-06-22)抽出 Repository(889行)+ 7 个 util(2024行),Service 本体只降 ~1500 行。
- 上轮明确遗留:候选 D(剧本导入分析)、角色参考图编排(循环依赖未解)。

## 2. 职责分布(按文件区段)

| 区段 | 行数 | 职责 | 可抽性 |
| --- | --- | --- | --- |
| 321-943 | 622 | 角色/场景参考图编排 | ⚠️ 难(ADR-0005 门面 + 调 requestOpenAi 内部依赖) |
| 943-1184 | 241 | 章节剧本 | ⚠️ 有状态编排 |
| 1184-1370 | 186 | AI 写草稿/大纲/导入入口 | 编排入口 |
| 1370-1700 | 330 | 剧情结构 | ⚠️ 有状态编排 |
| 1700-1990 | 290 | 分镜 | ⚠️ 有状态编排 |
| 1990-2300 | 310 | workbench快照+出图准备 | 装配 |
| 2300-2620 | 320 | 结构角色prompt+preflight normalize | 部分已抽 image-preflight.util |
| 2620-3010 | 390 | 角色 normalize/状态辅助 | ✅ 多数是纯函数(部分已抽 character-domain.util) |
| **3010-3320** | **310** | **剧本导入分析** | **✅ 最佳候选(纯算法)** |
| 3320-3730 | 410 | 图片API调用+通用辅助 | requestOpenAi 被参考图编排耦合 |

## 3. 关键发现:剧本导入分析是最佳抽取候选

### 3.1 依赖边界(决定性证据)

剧本导入分析的 9 个纯算法子方法**完全不碰 this 外部依赖**:

| 方法 | 行数 | this 外部调用 |
| --- | --- | --- |
| parseProvidedScriptChapters | 32 | 无 |
| extractChapterBoundary | 27 | 无 |
| inferScriptImportContentType | 33 | 无 |
| getScriptTextSignals | 28 | 无 |
| formatChapterSource | 16 | 无 |
| summarizeScript | 8 | 无 |
| extractMainCharactersSection | 10 | 无 |
| areNumericBoundariesCredible | 21 | 无 |
| createScriptImportAnalysis | 17 | 无 |

它们只互相调用(内部闭包),不碰 repository/tasks/workspacePath。这是教科书级的纯函数块。

### 3.2 编排方法(留 Service)

- `analyzeScriptImport`(87行):调 `getReadyProject` + 9 个纯算法。
- `importScriptToChapters`(82行):调 `getReadyProject`/`writeProjectFiles`/`clearProjectChaptersDir` + `parseProvidedScriptChapters`。

这两个入口保留在 Service(它们是有状态编排),但算法部分委托给新 util。

### 3.3 抽取收益

- 抽出 ~190 行纯算法 → Service 降到 ~3540 行。
- 这块是上轮明确跳过的 D 候选,补上后 D 彻底清零。
- 纯函数可独立测试(和上轮 workflow.util/story-normalize.util 模式一致)。
- 风险极低:无 this 依赖 = 无状态变化 = 行为等价可静态验证。

## 4. 为什么不抽角色参考图编排(最大块 622 行)?

### 4.1 循环依赖未解(上轮遗留的根因)

```
generateCharacterReference(442行)
  → this.requestOpenAiImage / this.requestOpenAiImageEdit(内部依赖)
  → this.repository / this.tasksService / this.characterReferenceQueue(状态)
```

角色图编排**内部耦合** `requestOpenAi*`(出图 HTTP 调用)和有状态队列。抽独立 service 会把 requestOpenAi 一起带走或反向依赖,形成循环。

上轮结论:"参考图生成状态编排留 Service——抽独立 service 会循环依赖,后续若拆需先理清 tasksService 边界。"

### 4.2 ADR-0005 门面约束

角色图编排方法(`queueCharacterReference`/`confirmCharacterPreview` 等)是 ToolCallback 的委托目标。抽独立 service 后若改调用面,破坏 ADR-0005。除非走"门面薄委托"模式(Service 保留薄方法转发),但那只是换了个地方放代码,Service 行数下降有限(薄委托本身占行)。

### 4.3 结论:本轮不动角色参考图编排

它的拆分需要先解 requestOpenAi 的耦合(抽 ImageProvider 网关),那是更大的一轮改造,不是本轮范围。

## 5. 本轮拆分范围(精确)

**唯一目标:抽剧本导入分析纯算法为 `script-import.util.ts`**

- 9 个纯算法方法 → util(无状态纯函数)。
- 2 个编排方法(analyzeScriptImport / importScriptToChapters)留 Service,改委托。
- 相关类型(ParsedScriptChapter / ScriptImportContentType / ScriptTextSignals 等)抽到 util 或 local-types。

不动:角色参考图编排、章节剧本编排、剧情结构、分镜、workbench 快照。

## 6. 风险与回滚

| 风险 | 应对 |
| --- | --- |
| 类型迁移遗漏(类型在 Service 内定义) | 逐个核实类型定义位置,统一搬到 util/local-types |
| 编排方法委托后 this 上下文丢失 | util 是纯函数(非 class 方法),无 this,编译期可查 |
| 行为不等价 | 纯函数无副作用,typecheck + 现有 source-guard 测试 + 新增 import util 测试验证 |
| 回滚 | 单阶段单 commit,失败 `git revert` |

## 7. 退出标准

1. Service 行数下降(~190 行)。
2. `corepack pnpm -w typecheck` 三包通过。
3. `corepack pnpm test` 全绿(含新增 script-import.util 测试)。
4. 调用面不变(analyzeScriptImport / importScriptToChapters 签名不变)。
5. Scrutiny 复核:纯算法迁移无行为变化,委托正确。

## 8. Scrutiny Review 静态复核结论(2026-06-24)

**结论:通过。**

### 8.1 拆分契约验证

| 检查项 | 结果 |
| --- | --- |
| Service 行数 | 3730 → 3518(-212 行) |
| 新 util 行数 | script-import.util.ts 231 行 |
| typecheck 三包 | ✅ 全通过 |
| 全量 test | ✅ shared 15 + server 46 = 61 tests 全绿 |
| 调用面不变 | ✅ analyzeScriptImport/importScriptToChapters 签名未变 |
| 无残留 this. 调用 | ✅ 0 处(grep 确认) |
| 无残留方法定义 | ✅ 0 处(grep 确认) |

### 8.2 行为等价性

9 个纯算法方法**零外部依赖**(不碰 repository/tasks/workspacePath),只互相调用。迁移到 util 仅去掉 `private`/`this.`,逻辑体逐字一致。行为等价由以下保证:
- 纯函数无副作用 → 无状态变化。
- typecheck 通过 → 类型契约不变。
- 24 个 util 测试覆盖核心路径(拆章/分类/边界/格式化/摘要)。
- 现有 37 个测试不受影响(source-guard/repository/workflow/script-format)。

### 8.3 新增测试有效性

script-import.util.spec.ts 24 个测试覆盖:
- parseProvidedScriptChapters:明确章节/markdown/无边界/空文本(4)
- extractChapterBoundary:中文数字/阿拉伯数字/markdown/普通文本(4)
- inferScriptImportContentType:invalid/worldbuilding/outline/script(4)
- areNumericBoundariesCredible:无数字边界/单数字章节(2)
- createScriptImportAnalysis:ready_to_import/non-ready(2)
- formatChapterSource:空/已格式化/普通文本(3)
- summarizeScript:首行/剥离markdown/截断(3)
- getScriptTextSignals:正常/空(2)

### 8.4 残留风险

- 候选 D 已清零,但 Service 仍 3518 行。最大遗留(角色参考图编排 622 行)未动,需先解 requestOpenAi 循环依赖(另立任务)。
- 本章无 UI 变更,Runtime/User Review = 命令验证(typecheck + test 已通过)。
