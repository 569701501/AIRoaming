---
doc_id: AIR-TASK-20260711-G2-UPSTREAM-FRESHNESS-PROGRESS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# G2 上游版本与 Freshness 推进记录

## 2026-07-11

- 用户确认继续下一份 G2 开发级文档。
- 使用 `$deep-think` 管理跨剧本、结构、分镜、预检、任务和工作流的版本规划。
- 本轮边界固定为只写文档，不修改 schema、migration、业务代码、数据库或真实 workspace。
- 已读取 G1 Schema/切换方案、七阶段缺口、ADR-0010、数据模型、任务协议和现有记忆。
- 已审计 `ChapterScriptService`、`StoryStructureService`、`StoryboardService`、`ImagePreflightService`、前后端 workflow 和共享 DTO。

## 当前结论

- 剧本 Working Text、AI pending 和正式 ScriptVersion 已有部分概念，但完成后继续保存不会发布新版本。
- 剧情结构确认会新建版本，字段编辑却原地更新已确认版本。
- 分镜已有 pending，但正式编辑仍原地更新，并清空 preflight/candidates/layout、倒退章节状态。
- 出图准备只以 storyboard ID + `updatedAt` 判断来源，角色/场景/画风输入没有统一摘要。
- 前后端 workflow 都只按 `Chapter.status` 推导 done/active/waiting，无法表达来源已更新和未确认修改。
- 已新增 proposed 文档：
  - `文档/04_方案与决策/ADR-0013_上游版本链与派生Freshness.md`
  - `文档/04_方案与决策/2026-07-11_G2上游版本链与Freshness开发方案.md`
  - `文档/04_方案与决策/2026-07-11_G2版本来源与Freshness契约字典.md`
  - `文档/06_测试与验收/G2上游版本链与失效验收清单.md`
- 已确定不新增模型：Script 使用 Chapter working fields，Story/Storyboard 使用 pending version，Preflight 使用 live preview + immutable revision，freshness 全部派生。
- 已补 `sourcePolicyVersion`，避免摘要算法升级后用新 policy 错判旧版本。
- 已同步 README、AI 上下文、七阶段进度、产品流程/MVP、系统架构、数据模型、任务协议、模块边界和总验收入口。
- 用户确认 G2 核心规则：dirty/pending 时旧成品仍可查看但禁止新下游任务；新正式版本确认后旧下游才显示“来源已更新”。
- 已将 ADR-0013 更新为 `active`，G2 主方案、契约字典和验收清单更新为 `accepted`；仅状态留痕，未进入实现。

## Handoff

- G2 文档阶段已完成并获用户确认；ADR-0013 为 `active`，三份开发/验收文档为 `accepted`。
- Scrutiny Review 通过；Runtime/User Review 本轮不适用，未来实施必须执行四条真实返修路径。
- 实现未开始；下一步等待用户确认后继续 G3 D1 漫画版式入口开发级文档。

## 验证记录

- 23 份 G2 新增/同步文档检查：本地引用缺失 0、奇数代码围栏 0、尾随空格 0、重复 doc_id 0。
- G1 Schema 模型清单重新提取为 44，G2 没有新增第 45 个模型。
- 用户确认前四份 G2 正式文档均为 proposed；确认后已按职责更新为 ADR `active`、方案/契约/验收 `accepted`，同时继续明确“尚未实现”。
- `git diff --check` 通过。
- `git status --short` 未发现 `文档/` 之外的改动。
- `文档/记忆/MEMORY.md` 为 119 行，未超过 500 行。
