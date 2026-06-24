# 探索发现与方案拷问

---
doc_id: AIR-TASK-TEST-INFRA-FINDINGS
status: active
created: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent
source: 任务 2026-06-24_测试基础设施与回归保护 Orchestrator 阶段
---

## 1. 根本问题:这批测试到底要锁住什么?

不是"提高覆盖率",不是"为拆分补测试",而是**锁住已经发生过、会复发的数据损坏风险**。

具体到这次:`sourceText` 被空内容覆盖(已修),用户问"会不会再出现"。测试的价值 = 用可执行的断言证明"那个路径堵住了",并防止未来被改回去。

推论:**测试范围必须由"发生过的事故 + 拆分遗留的高风险纯逻辑"驱动,而不是追求覆盖度。**

## 2. 关键探索证据

### 2.1 测试现状:整个项目零测试

- `apps/server/package.json` 无 test 脚本,无测试依赖。
- `apps/web/package.json` 无 test 脚本。
- 无 vitest/jest 配置文件,无任何 *.spec.ts / *.test.ts。
- 代价:所有改动靠 typecheck + 手动 HTTP 验证,无回归保护。

### 2.2 框架选型:Vitest 是唯一合理选择

约束链:
- 后端 NestJS 10 + ESM(`"type": "module"`) + tsx 运行
- 前端 Vite 5 + vue-tsc
- shared 纯 TypeScript + ESM

Jest 在 ESM 下需要复杂配置(ts-jest/esbuild-jest + transform),且与 Vite 生态割裂。
Vitest 原生支持 ESM + TypeScript(零编译配置),与现有 Vite 栈同源,配置最轻。

结论:**Vitest,无替代方案争议。**

### 2.3 可测性分级(seam 分析)

| 对象 | 依赖 | 可测性 | 备注 |
| --- | --- | --- | --- |
| shared 纯函数(`script-format.ts` 等) | 无 | 极易,直接 import 调用 | stripChapterScriptName 等 |
| projects/*.util.ts(纯函数) | 无/仅 shared | 极易 | workflow/story-normalize |
| `ProjectRepository` | 仅 WorkspacePathService(1 个注入,env 可控) | 高,真实临时目录 | fs 往返测试 |
| `ProjectsService` 校验逻辑 | 4 个注入(含 TasksService/SettingsService 重依赖) | 中,需 mock 或 Nest TestModule | 但校验失败时不触达依赖 |
| `ProjectsService` 编排逻辑 | 4 个注入 + 跨模块副作用 | 低 | 本批不测,留 e2e |
| Controller / Dialogue / OpenCode | 外部 AI | 极低 | 不测 |

### 2.4 校验逻辑的可测性优势(关键)

`saveChapterDraft` / `updateProjectDraft` 的非空校验在方法**第一行**,校验失败时 `throw` 在 `getReadyProject()` 之前。

含义:**测试校验逻辑时,repository/tasksService 根本不会被调用。** 可以用最轻的 mock(空对象或 vi.fn)通过,不需要构造完整项目数据。

这让 P0 回归测试极轻:几行就能锁住"空 sourceText → throw"。

### 2.5 Repository 往返测试的价值

上次拆分核心产出是 `ProjectRepository`(889 行),封装了 fs 加载/写入/缓存。它**无测试保护**。

本次 bug 的恢复依赖正是 Repository 的加载链:`readChapterFromWorkspace` 优先读 `script.md`。如果加载链被改坏,数据恢复机制失效。

Repository 测什么:
- 写入 → 重载 → sourceText 一致(往返一致性)
- 加载链优先级:script.md > chapter.json.sourceText
- 空章节不崩,版本文件存在时加载正常

风险:Repository 构造函数注入 WorkspacePathService,需通过 `AIROAMING_WORKSPACE_ROOT` env 指向临时目录。已验证该 env 被 `workspace-path.service.ts:14` 读取。

## 3. 方案拷问(grill)

### Q1:为什么不测前端 ScriptDocumentEditor 的 canSave?

前端 canSave 判空是本次修复的一部分。但:
- 前端组件测试需搭 @vue/test-utils + happy-dom,基础设施成本高。
- canSave 是纯 computed,逻辑简单,后端校验是最终防线。
- 后端校验测试已能锁住"空内容无法落盘"——这是数据安全的根本保证。

决策:**本批不搭前端组件测试。** 前端 canScale 留作未来 e2e 覆盖。后端校验是兜底防线,优先测它。

### Q2:为什么用真实临时目录测 Repository,而不是 mock fs?

Repository 的**全部职责**就是封装 fs 读写。mock 掉 fs 等于测了个寂寞——真实文件行为(权限、编码、并发写入、目录结构)无法被 mock 准确反映。

本次 bug 正是"fs 写入空内容"的真实行为。用真实临时目录(os.tmpdir + 每测试隔离)能复现并锁住这类问题,且仍是毫秒级。

决策:**真实临时目录,每测试 beforeEach 建目录,afterEach 清理。**

### Q3:测试要覆盖到什么程度才算"锁住"?

最小可接受集(若资源紧张,这是底线):
1. `saveChapterDraft` 空 sourceText → throw ✅(锁本次 bug)
2. `updateProjectDraft` 空 sourceText → throw ✅(锁同型 bug)
3. `stripChapterScriptName` 核心用例 ✅(本次恢复依赖的纯逻辑)
4. Repository 写入→重载 sourceText 往返一致 ✅(锁拆分核心产出)

加分项(若有余力):
5. workflow.util 状态机关键转换
6. story-normalize 关键 normalize

### Q4:这批测试会带来维护负担吗?

风险:测试本身成为维护负担。
缓解:
- 只测"行为契约"(输入→输出/异常),不测实现细节(不 assert 内部 Map 状态、不 mock 到方法级)。
- 纯函数测试几乎零维护成本。
- Repository 测试用真实 fs,行为稳定,实现重构时测试不需要改。

## 4. 技术决策汇总

| 决策 | 结论 | 依据 |
| --- | --- | --- |
| 框架 | Vitest | ESM 原生 + Vite 同源 + 零编译配置 |
| Repository 隔离 | 真实临时目录(env 注入) | Repository 职责即 fs,mock 失真 |
| Service 校验测试 | 轻量 mock(校验不触达依赖) | 校验在方法首行,throw 早于依赖调用 |
| 前端组件测试 | 本批不做 | 成本高,后端校验是兜底 |
| 测什么 | 行为契约,不测实现细节 | 降低维护负担 |
| 范围驱动 | 事故驱动 + 拆分遗留高风险 | 锁住会复发的风险,非追求覆盖度 |

## 5. 残留风险

1. **无 e2e**:全链路(前端→后端→fs)仍无自动化测试。本批是单元/集成层,不是端到端。
2. **前端 canSave 无测试**:理论上前端仍可能误触发保存,但后端会拒绝。两层防线剩一层被测。
3. **Dialogue/OpenCode 链路无测试**:AI 写入路径(update_chapter_draft 工具)走 ToolCallback→Service,本批只测 Service 校验,不测 ToolCallback 转发。若 ToolCallback 绕过 Service 校验直接写,本批测不到——需额外确认 ToolCallback 是否也走 saveChapterDraft(待 Worker 阶段核实)。

## 6. 写入路径全核实(2026-06-24 Orchestrator 补充)

核实所有写 sourceText 的路径,**确认 bug 范围和测试边界**:

| 路径 | 触发者 | 非空校验 | 状态 |
| --- | --- | --- | --- |
| `saveChapterDraft` | 用户"保存草稿"按钮 | ✅ 本次已加 | 已修 |
| `updateProjectDraft` | 旧项目级 PATCH(前端已不用) | ✅ 本次已加 | 已修 |
| `writeChapterDraftFromAI` → `applyChapterPendingSource` | AI 工具(写 pending 缓冲) | ✅ 原本就有(`AI_CHAPTER_DRAFT_REQUIRED`) | 从未有 bug |
| `confirmChapterPendingSource` | 用户"采用草稿"(pending→正式) | 间接安全(来源是已校验的 pending) | 安全 |
| `clearChapterScript` | 用户"清空本章" | 故意清空 | 正确语义 |
| `resetProjectScript` | 整本重置 | 故意清空 | 正确语义 |

**关键结论**:
- ToolCallback 根本不写章节剧本(只管角色/场景图/状态查询)。
- AI 写剧本走 `writeChapterDraftFromAI`,它**走 pending 缓冲层且有非空校验**,从未受本次 bug 影响。
- 本次 bug 只影响"用户手动保存"的两条路径,已全部修复。
- 因此 P0 测试只需覆盖 `saveChapterDraft` + `updateProjectDraft` 两个用户写入入口的校验,即可锁住全部事故路径。
- `writeChapterDraftFromAI` 的校验也应补测试(防止未来被改掉),列为 P1。

## 7. Scrutiny Review 静态复核结论(2026-06-24)

**结论:通过。**

### 7.1 测试是否真覆盖事故路径?

| 事故路径 | 测试 | 锁住方式 |
| --- | --- | --- |
| saveChapterDraft 空 sourceText 覆盖(本次 bug 元凶) | source-guard.spec.ts 2 个用例 | 反向验证已确认:去校验→测试红 |
| updateProjectDraft 空 sourceText(同型漏洞) | source-guard.spec.ts 2 个用例 | 校验在首行,mock 不触达 |
| writeChapterDraftFromAI 空 sourceText(AI 路径防退化) | source-guard.spec.ts 2 个用例 | 校验原已有,测试防退化 |
| Repository 加载链优先级(本次恢复依据) | project-repository.spec.ts 5 个用例 | 真实 fs 往返 + 优先级用例 |

覆盖判定:**3 条写入路径 + 加载链全覆盖,事故路径无遗漏。**

### 7.2 测试是否测行为契约而非实现细节?

- source-guard 测"输入空→抛 BadRequestException",不测内部 Map 状态、不测 mock 调用次数。✅
- repository 测"写入→重载→sourceText 相等",不测 writeChapterFiles 内部如何拼路径。✅
- 纯函数测输入→输出,无副作用断言。✅

判定:**测行为契约,实现重构时测试不需要改。**

### 7.3 Stub 是否结构正确?

对照 `local-types.ts`:`LocalChapter`(18 字段)/`LocalProject`(15 字段)stub 全字段覆盖,typecheck 通过。`ProjectType` 用了合法值 `"comic"`(非错误的 `"manga"`)。

### 7.4 反向验证是否有效?

saveChapterDraft 校验被临时注释后,对应 2 个测试立即失败(2 failed),证明测试非假绿。反向验证后代码已恢复。

### 7.5 残留风险(坦诚)

1. **前端 canSave 无测试**:前端判空逻辑仍未被自动化测试覆盖。后端校验是兜底防线(已测),但前端按钮在切章竞态时仍可能亮起——只是后端会拒绝。
2. **无 e2e**:全链路(前端→后端→fs)无自动化测试。本批是单元/集成层。
3. **DialogueService / OpenCode 链路无测试**:AI 写入虽走 writeChapterDraftFromAI(已测校验),但 DialogueService 的工具分流逻辑未测。
4. **Service 编排逻辑无测试**:角色图生成 queue/run/confirm 全流程未测(依赖 4 注入 + 跨模块副作用,本批明确不做)。

### 7.6 复核通过条件

- [x] 代码改动与 task_plan 目标一致(锁事故路径 + 补 Repository + 补纯函数)。
- [x] 数据结构/协议/路径未变(只加测试,不改实现)。
- [x] 测试覆盖关键事故路径,且反向验证有效。
- [x] typecheck 三包通过 + 37 tests 全绿。
- [x] 无遗留调试代码(已 grep 确认)。
