---
doc_id: AIR-TASK-20260723-LAYOUT-REGENERATE-PLAN
status: completed
created: 2026-07-23
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent
source: 用户明确要求删除旧漫画成稿草稿并重新生成
---

# 重生成漫画成稿草稿任务计划

## 1. 目标

对项目 `雨夜末班车·真实验收` 的章节 `雨夜点名` 删除当前旧版 V1 `LayoutWorkingCopy`，不保留旧草稿备份；复用现有正式分镜、候选定稿图、字体与上游版本，生成并应用一份新的 V2 漫画成稿草稿。

## 2. 非目标

- 不修改或删除剧本、剧情结构、分镜、候选图、角色、场景和字体素材。
- 不删除既有正式 `LayoutRevision`、出版记录和素材包；它们继续作为已生成历史，当前新草稿以正式版本为基线继续编辑。
- 不新增旧稿升级入口，不修改产品代码或数据库 Schema。
- 不创建旧草稿备份；这是用户明确选择。

## 3. 阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P1 | 读取事实源，核对精确项目、章节、Working Copy、运行任务与来源门禁 | completed |
| P2 | 删除唯一目标 Working Copy，创建 initial `layout_compose`，等待并应用 | completed |
| P3 | 静态复核数据库作用域与不可变证据 | completed |
| P4 | 隔离浏览器验证 V2 页面、智能调整入口和上游素材未变 | completed |
| P5 | 完成留痕与交接 | completed |

## 4. 强制验收标准

1. 目标章节最终恰有一份 `schemaVersion=2`、`documentKind=layout_document_v2` 的 Working Copy。
2. 新 Working Copy 由成功的 `layout_compose` initial 任务和同事务 `LayoutCompositionApplication(result=initial_working_copy)` 创建。
3. 新成稿覆盖当前 11 个 active Shot；对白/旁白由任务报告确认完整。
4. 剧本、Story/Storyboard/Preflight、候选与 current lock 数量和标识在操作前后不变。
5. 页面可进入编辑器，“重新排一版”和“智能调整”不再因 V1 文档而禁用。
6. 旧 V1 Working Copy 不再存在；不创建其备份副本。

## 5. 退出条件

- P1～P5 全部完成。
- Scrutiny Review 结论为通过或明确残留风险。
- Runtime/User Review 使用 Codex 隔离浏览器完成，不操作用户浏览器。

## 6. 当前角色边界

- Orchestrator：限定删除范围和验收条件，不执行越界清理。
- Worker：只删除目标 Working Copy，并调用现有 initial composition 路径。
- Scrutiny Review：只读核对数据库行、任务来源、应用凭证和上游不变性。
- Runtime/User Review：使用 Codex 隔离浏览器验证真实页面。

## 7. 完成结论

- 旧 V1 Working Copy 已按用户决定直接删除，未创建草稿备份。
- 新 V2 Working Copy 已通过正式 initial `layout_compose` 任务与同事务应用凭证创建。
- 11 个 active Shot 和 19 条对白/旁白全部放置；上游版本、current candidate lock、正式 LayoutRevision 与既有导出记录未变化。
- 隔离浏览器确认“重新排一版”“智能调整”和人工画格/裁切属性均可使用。
- 本次任务使用 `rule_fallback`，未获得视觉 AI 主体/安全区分析；气泡审美和画面避让仍需后续智能调整或人工复核。
