# 测试基础设施与回归保护

---
doc_id: AIR-TASK-TEST-INFRA
status: completed
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-24 sourceText 空覆盖 bug 修复后的回归保护需求
---

## 1. 背景

2026-06-24 修复了"剧本第一章 sourceText 被空内容覆盖"的 bug。根因:`saveChapterDraft` / `updateProjectDraft` 无非空校验,前端切章竞态误触发空保存。已修复(后端校验 + 前端判空),并从历史版本恢复数据。

用户问"会不会再出现"。本任务用**可执行的自动化测试**锁住这次修复,并顺带给上次 ProjectsService 拆分(无测试保护)的核心产出补最低限度的回归保护。

详细探索见 `findings.md`。

## 2. 目标

1. 为项目建立**第一套测试基础设施**(Vitest)。
2. 用回归测试**锁住 sourceText 非空校验**,确保未来任何改动若去掉校验,测试会红。
3. 给 `ProjectRepository`(拆分核心产出,889 行,无测试)补关键往返测试。
4. 给本次 bug 涉及的核心纯函数(`stripChapterScriptName` 等)补单元测试。

## 3. 非目标

- **不追求覆盖率**:不为了数字而测,只测会复发的风险路径。
- **不测前端组件**:不搭 @vue/test-utils;前端 canSave 留作未来 e2e。
- **不测 Controller / Dialogue / OpenCode 运行时**:依赖外部 AI,成本高收益低。
- **不测 Service 编排逻辑**(角色图生成 queue/run/confirm 全流程):依赖 4 个注入 + 跨模块副作用,本批不碰。
- **不改业务代码行为**:只加测试,不改实现(本次 bug 修复已另完成)。

## 4. 验收标准

- [x] `pnpm test` 能在秒级运行,返回 0 退出码。
- [x] sourceText 非空校验有回归测试:空内容 → 抛 `CHAPTER_SCRIPT_REQUIRED`。
- [x] Repository 写入→重载往返一致测试通过。
- [x] 核心纯函数(stripChapterScriptName)测试通过。
- [x] 全部测试确定性、无 flaky(不依赖网络/全局状态/时序)。
- [x] Scrutiny Review 静态复核通过(见 findings §7)。

## 5. 测试范围(按优先级)

### P0:事故驱动(必须做)

| 测试 | 锁住的风险 | seam |
| --- | --- | --- |
| `saveChapterDraft` 空 sourceText → throw | 本次 bug 元凶 | ProjectsService + 轻量 mock |
| `updateProjectDraft` 空 sourceText → throw | 同型潜伏漏洞 | 同上 |
| `writeChapterDraftFromAI` 空 sourceText → throw | AI 写入路径校验(防未来退化) | 同上 |
| Repository 写入→重载 sourceText 一致 | 拆分核心产出无保护 + 数据恢复链 | Repository + 真实临时目录 |

### P1:拆分遗留高风险纯函数(应做)

| 测试 | 锁住的风险 | seam |
| --- | --- | --- |
| `stripChapterScriptName` 核心用例 | 本次 bug 恢复依赖的纯逻辑 | shared 纯函数 |
| `extractChapterScriptTitle` | 章节标题解析(写入/恢复都用) | shared 纯函数 |
| `workflow.util` 关键状态转换 | 章节状态机推进逻辑 | 纯函数 |

## 6. 阶段划分

### 阶段 0:搭建 Vitest 基础设施

- 后端 `apps/server` 加 vitest 依赖 + 配置 + test 脚本。
- 根目录加聚合 test 脚本(`pnpm -r test`)。
- shared 包加 test 脚本(纯函数测试放 shared 侧)。
- 验证:一个最简 dummy 测试能跑通。

### 阶段 1:P0 回归测试

- Service 校验测试:`ProjectsService` 实例化用轻量 mock(4 个注入传 stub,校验不触达它们)。
- Repository 往返测试:`AIROAMING_WORKSPACE_ROOT` 指向 `os.tmpdir()` 子目录,beforeEach 建/afterEach 清。
- 验证:测试红能复现 bug(去掉校验后测试失败),绿能通过。

### 阶段 2:P1 纯函数测试

- `stripChapterScriptName` / `extractChapterScriptTitle` 等放 shared 包测试。
- `workflow.util` 放后端测试。
- 验证:全部通过。

### 阶段 3:Scrutiny Review

- 静态复核:测试是否真的覆盖事故路径、是否测行为契约而非实现细节。
- 输出结论 + 残留风险。

## 7. 关键技术决策

| 决策点 | 结论 | 依据 |
| --- | --- | --- |
| 框架 | Vitest | ESM 原生 + Vite 同源 + 零编译配置 |
| Service 测试隔离 | 轻量 mock(stub 4 个注入) | 校验在方法首行,throw 早于依赖调用,不触达 repository |
| Repository 隔离 | 真实临时目录(env 注入) | Repository 职责即 fs,mock 失真 |
| 测什么 | 行为契约(输入→输出/异常) | 降低维护负担,实现重构时测试不需改 |
| 范围驱动 | 事故 + 拆分遗留高风险 | 锁住会复发的风险,非覆盖度 |

## 8. 退出标准

1. 阶段 0-2 执行完毕,`progress.md` 时间线完整。
2. `pnpm test` 全绿,秒级,确定性。
3. Scrutiny Review 通过(测试真覆盖事故路径 + 测行为不测实现)。
4. 文档同步:`06_测试与验收` 记录测试体系与运行方式;完成记录写入。
5. Runtime/User Review:用户本地确认 `pnpm test` 可运行(无 UI,此步为命令验证)。

## 9. 当前角色边界

- 当前角色:**Orchestrator**(规划完成,待用户确认后转 Worker)。
- Worker 阶段开始前需用户确认本 plan。
