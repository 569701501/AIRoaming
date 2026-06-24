# 执行进度

---
doc_id: AIR-TASK-PROJSPLIT2-PROGRESS
status: active
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_ProjectsService拆分第二轮
---

## 时间线

### 2026-06-24 Orchestrator 阶段(规划)

**操作**:
- 统计当前 Service:3730 行,151 方法。
- 分析职责分布:角色参考图编排(622行,最大但难抽)、剧本导入分析(310行,最佳候选)、图片API(410行,被参考图耦合)。
- **依赖边界分析(决定性)**:剧本导入分析的 9 个纯算法方法零 this 外部依赖,只互相调用。analyzeScriptImport/importScriptToChapters 是有状态编排入口。
- 确认不抽角色参考图(循环依赖 + ADR-0005 门面,findings §4)。
- 写 findings.md + task_plan.md。

**关键结论**:本轮只抽剧本导入分析(候选 D),精确范围,风险极低。

**下一步**:用户确认 → Worker 阶段 1(抽 script-import.util.ts)。

**Handoff**:规划态,无代码变更。

### 2026-06-24 Worker 阶段 1-3(执行)

**阶段 1:抽 script-import.util.ts**
- 新增 `apps/server/src/projects/script-import.util.ts`(231 行):迁入 9 个纯算法方法(parseProvidedScriptChapters/extractChapterBoundary/createScriptImportAnalysis/inferScriptImportContentType/getScriptTextSignals/areNumericBoundariesCredible/formatChapterSource/summarizeScript)+ 4 个类型(AnalyzeScriptImportInput/ParsedScriptChapter/ChapterBoundaryMatch/ScriptTextSignals)。
- Service 改动:加 `scriptImportUtil` import;删 9 方法 + 4 类型定义;8 个调用点 `this.xxx()` → `scriptImportUtil.xxx()`;移除不再用的 shared import(formatChapterScriptDocument/isChapterScriptDocument)。
- Service 行数:3730 → 3518(-212 行)。

**阶段 2:补 util 测试**
- 新增 `script-import.util.spec.ts`(24 tests):拆章/边界识别/内容分类/可信度/分析构造/格式化/摘要/信号。

**阶段 3:Scrutiny 复核**
- typecheck 三包通过;全量 test 61 个全绿(shared 15 + server 46)。
- 调用面不变;无残留 this 调用/方法定义(grep 确认 0 处)。
- 详见 findings §8。

**验证**:
- `corepack pnpm -w typecheck`:✅ 三包通过。
- `corepack pnpm test`:✅ 61 tests 全绿。

**任务状态:完成。**
