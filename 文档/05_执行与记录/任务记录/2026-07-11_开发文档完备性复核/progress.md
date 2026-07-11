---
doc_id: AIR-TASK-20260711-DOC-READINESS-PROGRESS
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# G0–G5 开发文档完备性复核推进记录

## 2026-07-11

- 用户决定暂不继续编写素材包开发方案，将 G6 放到后续。
- 使用 `$deep-think` 对跨产品、数据库、任务、文件、编辑器和验收的文档体系做正式复核。
- 已确认 G0–G5 均有开发级主文档与验收入口；根据逐阶段“继续”的统一确认口径与用户本轮澄清，全部为 `accepted`。
- 已发现当前主要矛盾不是缺少阶段方案，而是部分上位文档仍把 G6/G7 当作开始开发前置，且旧执行路线图仍把一镜一页/目录包骨架写成当前完成口径。
- 本轮只调整文档范围、状态解释和留痕，不进入功能开发。
- 已新增 `文档/04_方案与决策/2026-07-11_G0至G5开发文档完备性复核.md`，给出阶段矩阵、横向契约、实施期 E0、开工批准项和停止线。
- 已将产品范围、核心用户流程、UI 信息架构、七阶段升级顺序、G5 下一步、验收策略和完整链路基线统一为“两层验收”：当前 G0–G5 到 `layout_publication/layout_done`；未来 G6/G7 到 ZIP/`exported`。
- 已更新 `路线图与里程碑.md`，把旧一镜一页、复制源图和目录包明确标为历史骨架，不再作为 M3 当前完成证据。
- 已补齐 G0–G3 独立 Handoff，并将已经完成的 G0 规划任务从 `in_progress` 收口为 `complete`；G0 正式文档为 `accepted`，功能仍未实现。
- 机械核对发现 G5 清单实际为 200 个唯一验收 ID，旧记录计数多 1；已更正相关记录。G1 模型表确认为 44/44 唯一模型。
- 用户指出 G0/G1/G5 实际已经确认。回查发现三者均已通过“继续下一阶段”完成确认，只是状态留痕未同步；现已统一将 G0–G5 正式方案/契约/验收更新为 `accepted`，仍保持“尚未实现、尚未授权开发”。
- 用户补充 9 项事实源冲突，涉及 `shot_generate` 输出、角色层级、剧本路由、候选/角色素材路径、Asset 字段、ConversationThread.stepKey 和文档章节编号；重新开启本复核任务逐项核证。
- 9 项均经代码、Shared DTO、ADR 和现行路由核实并完成修订；反向扫描又清理了素材目录树、候选版本示例和 7 月 9 日任务记录中的旧 PNG 表述。
- 关联扫描另发现 `buildStoryboardPrompt` 把合法 `over_shoulder` 写成 `over_the_shoulder`；已在正式协议和任务发现中登记，因本轮没有代码开发授权而未修改实现。

## 验证记录

- `git diff --check`：通过。
- 文档改动范围检查：未出现 `apps/`、`packages/`、`prisma/` 或 `workspace/` 改动。
- 全仓 118 个 `json` 代码块全部可解析；433 个 Markdown 文件的代码围栏均闭合。
- 全仓 `doc_id` 无重复；本次 G0–G5/复核文档 frontmatter 必填键完整。
- 相关事实源共检查 227 个本地 Markdown 引用，缺失 0。
- G0–G5 六个规划任务目录均有 `handoff.md`。
- G1 模型 44/44 唯一；G5 验收 ID 200/200 唯一。
- 长期记忆 126 行，未超过 500 行。
- 未运行代码测试或 Runtime/User Review：本轮只改文档，没有代码、Schema、数据库、页面或产物变化。
- R5 定向契约检查通过：`shot_generate` 新字段、五级角色、`/script` 路由、七步对话 scope、三类素材规范路径、22 个 Asset 顶层字段及两份章节编号均一致。

## Scrutiny Review

通过。G0–G5 的产品、数据、任务、文件、秘密、回滚、UI 和验收契约可形成独立开发波次；用户补充的 9 项同步冲突已清零，没有把 G6 ZIP 混入 G5，也没有把 accepted、implemented 和 verified 混为一谈。
