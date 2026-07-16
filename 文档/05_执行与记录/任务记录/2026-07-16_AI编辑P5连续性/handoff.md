---
doc_id: AIR-TASK-20260716-EDIT-P5-HANDOFF
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: AI 编辑 P5 连续性实施与验证
---

# AI 编辑 P5 连续性 Handoff

## 已完成

- 第 N 章 AI 改写读取第 N-1 章当前正式全文、版本身份和摘要；第 1 章明确跳过。
- 缺失前章正式版本时在模型调用前停止；模型运行期间上一章改变时，创建 pending 的事务拒绝旧结果。
- P5 仅保护当前稿已经建立的跨章承接，不强迫低层改写修复源稿原有缺口。
- P4、P5 与格式错误共用一次定向修订预算；第二次仍失败不创建 pending。
- 修复对话线程轮询会提前中断非流式生成的运行时竞态。

## 保持不变

- 页面展示字段、按钮和确认步骤。
- 章节 Markdown、StoryStructure 和数据库 Schema。
- 切换章节不自动生成，仍由用户在对话框明确要求生成或改写。
- 已有剧本导入 B1～B5。

## 验证

- 聚焦：4 files / 40 tests。
- Server 全量：104 files / 635 tests，634 通过；1 个无关备份恢复用例固定 5 秒超时，隔离复跑 1/1、3.316 秒通过。
- Workspace typecheck、E2E typecheck、三包 production build、Skill quick validation：通过。
- DB-only Chromium：连续 3/3，run ID `g0-34516-mrn3ktip-3f6b2fc2`。

## 后续边界

- revision pending 仍是 `kind=legacy`，没有持久 base draft / previous script 来源绑定。若未来需要历史审计，应单独设计来源策略和迁移，不能把本轮运行时围栏描述成完整 provenance。
- 当前 P5 是高置信语义锚点不退化，不覆盖伤势、道具数量、角色知识等完整世界状态账本。
