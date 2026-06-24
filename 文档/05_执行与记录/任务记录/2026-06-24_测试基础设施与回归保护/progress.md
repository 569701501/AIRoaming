# 执行进度

---
doc_id: AIR-TASK-TEST-INFRA-PROGRESS
status: active
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_测试基础设施与回归保护
---

## 时间线

### 2026-06-24 Orchestrator 阶段(规划)

**操作**:
- 调研测试现状:整个项目零测试(后端/前端/shared 均无 test 脚本、无配置、无 spec)。
- 核实框架选型约束:后端 NestJS+ESM+tsx,前端 Vite,shared 纯 TS+ESM → Vitest 是唯一合理选择。
- 分析可测性分级:shared 纯函数(极易) > Repository(高,真实临时目录) > Service 校验(中,轻量 mock) > Service 编排(低)。
- **核实全部写 sourceText 路径**(关键):确认 bug 仅限 `saveChapterDraft` + `updateProjectDraft` 两条用户路径;AI 写入走 `writeChapterDraftFromAI`→pending 缓冲,原已有非空校验,从未受影响;ToolCallback 不写章节剧本。
- 写 findings.md(方案拷问 + 路径核实)。
- 写 task_plan.md(目标/非目标/阶段/验收)。

**关键结论**:
- P0 测试范围精确收窄:3 个写入入口校验 + Repository 往返,即可锁住全部事故路径。
- AI 写入路径原已有校验,本次 bug 是用户路径独有漏洞,已全修复。

**验证**:
- 无代码改动,纯规划。

**下一步**:
- 等用户确认 task_plan 后,转 Worker 执行阶段 0(搭建 Vitest)。

**Handoff**:
- 当前为规划态,无代码变更。
- 用户确认 plan → Worker 从阶段 0 开始:后端加 vitest 依赖 + 配置。

### 2026-06-24 Worker 阶段 0-2(执行)

**阶段 0:搭建 Vitest 基础设施**
- 改动文件:
  - `package.json`(根):加 `test` 聚合脚本。
  - `apps/server/package.json`:加 vitest devDep + `test`/`test:watch` 脚本。
  - `packages/shared/package.json`:加 vitest devDep + `test`/`test:watch` 脚本。
  - `apps/server/vitest.config.ts`(新):后端测试配置(保留 decorator 元数据)。
  - `packages/shared/vitest.config.ts`(新):shared 测试配置。
- 验证:冒烟测试 1 passed,基础设施可用。冒烟测试已删除。

**阶段 1:P0 回归测试**
- 新增 `apps/server/src/projects/projects.service.source-guard.spec.ts`(8 tests):
  - saveChapterDraft 空/空白 sourceText → throw(2 个)+ 非空放行(1 个)。
  - updateProjectDraft 空/空白 sourceText → throw(2 个)+ undefined 不触发(1 个)。
  - writeChapterDraftFromAI 空/空白 sourceText → throw(2 个)。
  - **反向验证**:临时去掉 saveChapterDraft 校验,2 个测试立即变红,确认测试有效(非假绿)。
- 新增 `apps/server/src/projects/project-repository.spec.ts`(5 tests):
  - 写入→重载 sourceText 往返一致。
  - scriptVersions 保留(本次 bug 恢复依据)。
  - 加载优先级:script.md 优先于 chapter.json.sourceText(复现 bug 恢复机制)。
  - 空章节不崩。
  - 多次写入取最新值。
- 关键实现:writeChapterDraftFromAI 校验在 getReadyProject 之后,需要 mock repository 补 setProject/saveProject/clearProjectChaptersDir/hasProject;saveChapterDraft/updateProjectDraft 校验在首行,mock 不触达。

**阶段 2:P1 纯函数测试**
- 新增 `packages/shared/src/script-format.spec.ts`(15 tests):
  - stripChapterScriptName(6 个):多前缀、英文冒号、无名称行、空/空白。
  - extractChapterScriptTitle(4 个):markdown/纯文本/中文数字/无标题。
  - extractChapterScriptName(3 个)。
  - formatChapterScriptDocument(2 个)。
- 新增 `apps/server/src/projects/workflow.util.spec.ts`(9 tests):
  - resolveWorkflowCurrentStepKey 全状态转换覆盖(draft→exported)+ null 兜底 + preflight 分支。

**Scrutiny 发现并修复的 typecheck 错误**:
- `type: "manga"` → `"comic"`(ProjectType 枚举)。
- STUB_WORKFLOW 补 schemaVersion + projectId。
- mock repository 去掉过严的类型标注(改用内联对象)。

**验证**:
- `corepack pnpm -w typecheck`:✅ shared/web/server 三包通过。
- `corepack pnpm test`:✅ shared 15 + server 22 = 37 tests 全绿。

**Handoff**:
- 代码与测试完成,待 Scrutiny 静态复核结论 + 文档同步。

### 2026-06-24 阶段 3(Scrutiny 复核 + 文档同步)

**Scrutiny Review 结论:通过**(详见 findings §7)。
- 测试覆盖 3 条写入路径 + Repository 加载链,事故路径无遗漏。
- 测试测行为契约不测实现;Stub 结构与 local-types.ts 完全匹配。
- 反向验证有效(去校验→测试红);无遗留调试代码。
- 残留风险:前端组件/e2e/Dialogue 链路/Service 编排未覆盖,已在 findings 坦诚记录。

**文档同步**:
- `文档/06_测试与验收/自动化测试体系.md`(新):测试框架、运行命令、覆盖范围、设计原则。
- `文档/05_执行与记录/功能完成记录/2026-06-24_测试基础设施与回归保护.md`(新):完成记录。
- `文档/00_索引/AI上下文入口.md`:加 sourceText bug 修复 + 测试体系建立事实;开发命令补 `pnpm test`。
- 任务目录 task_plan 状态改 completed,验收标准全勾选。

**最终验证**:
- `corepack pnpm -w typecheck`:✅ 三包通过。
- `corepack pnpm test`:✅ shared 15 + server 22 = 37 tests 全绿,< 1 秒。

**Runtime/User Review**:
- 本任务无 UI 变更,运行复核 = 命令验证(用户本地跑 `corepack pnpm test` 即可确认)。

**任务状态:完成。**
