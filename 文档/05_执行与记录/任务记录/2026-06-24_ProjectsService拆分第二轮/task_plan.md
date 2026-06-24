# ProjectsService 拆分第二轮:剧本导入分析

---
doc_id: AIR-TASK-PROJSPLIT2
status: completed
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 上轮拆分(2026-06-22)遗留的候选 D
---

## 1. 背景

上轮 ProjectsService 拆分(2026-06-22)抽出 Repository + 7 个 util,Service 从 5236 降到 3730 行,但明确遗留候选 D(剧本导入分析)未抽。本轮补上这一块。

详细探索见 `findings.md`。

## 2. 目标

抽出剧本导入分析的 9 个纯算法方法为 `script-import.util.ts`,Service 保留 2 个编排入口(analyzeScriptImport / importScriptToChapters)改为委托。

## 3. 非目标

- **不动角色参考图编排**(622 行最大块,循环依赖未解,需先抽 ImageProvider 网关,另立任务)。
- **不动章节剧本/剧情结构/分镜编排**(有状态,风险高)。
- **不改调用面**(ADR-0005 约束)。
- **不改业务行为**(纯收口重构,行为等价)。

## 4. 验收标准

- [x] Service 行数下降(~190 行纯算法移出)。实际:3730 → 3518(-212 行)。
- [x] 新增 `script-import.util.ts`,9 个方法迁出。
- [x] 相关类型定义迁移到 util(避免 Service 残留类型)。
- [x] `corepack pnpm -w typecheck` 三包通过。
- [x] `corepack pnpm test` 全绿,含新增 script-import.util 测试(24 个)。
- [x] 调用面不变(analyzeScriptImport / importScriptToChapters 签名与返回不变)。
- [x] Scrutiny 复核通过(见 findings §8)。

## 5. 阶段划分

### 阶段 1:抽 script-import.util.ts

- 识别 9 个纯算法方法及其相关类型(ParsedScriptChapter / ChapterBoundaryMatch / ScriptImportContentType / ScriptTextSignals / ScriptImportChapterPlan 等)。
- 新建 `script-import.util.ts`,迁入纯函数(去掉 `private`,改为 export)。
- 迁移类型定义到 util(或 local-types,视依赖)。
- Service 内部调用改 `this.xxx()` → `scriptImport.xxx()`。
- analyzeScriptImport / importScriptToChapters 保留,委托 util。

### 阶段 2:补 util 测试

- 给 script-import.util 补单元测试(纯函数,易测)。
- 覆盖:parseProvidedScriptChapters 拆章 / inferScriptImportContentType 分类 / areNumericBoundariesCredible 判定。

### 阶段 3:验证 + Scrutiny

- typecheck + test 全绿。
- Scrutiny:纯算法迁移无行为变化,委托正确,类型无残留。

## 6. 决策点

| 问题 | 结论 | 依据 |
| --- | --- | --- |
| 抽哪些 | 9 个零 this 外部依赖的纯算法 | 依赖边界分析(findings §3.1) |
| 留哪些 | analyzeScriptImport / importScriptToChapters(调 getReadyProject/writeProjectFiles) | 有状态编排 |
| 类型放哪 | util 自带类型(ParsedScriptChapter 等),DTO 类放 local-types | 类型内聚 |
| 为什么不抽角色图 | 循环依赖(requestOpenAi 耦合)+ ADR-0005 门面 | findings §4 |

## 7. 退出标准

1. 阶段 1-3 执行完毕,progress.md 时间线完整。
2. typecheck + test 全绿。
3. Scrutiny 复核通过。
4. 文档同步:03 模块梳理、完成记录、AI 上下文入口。

## 8. 当前角色边界

当前角色:**Orchestrator**(待用户确认后转 Worker)。
