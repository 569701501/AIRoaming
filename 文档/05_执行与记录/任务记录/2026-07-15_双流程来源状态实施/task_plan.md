---
doc_id: AIR-TASK-20260715-SCRIPT-SOURCE-STATE-PLAN
status: completed
created: 2026-07-15
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-07-15 创作与导入双流程设计 Handoff 的实施包 2
---

# 任务计划：双流程来源与状态实施

## 目标

为 AI 创作与已有剧本导入建立可追溯、可恢复、可约束的来源与状态基础，使后续 Prompt 编排可以安全地产生两类待确认稿，并最终汇合到现有正式 `ChapterScriptVersion`。

## 非目标

- 不接入生产动态 Prompt 或公开 Skill。
- 不修改当前剧本页和剧情结构页的内容展示字段。
- 不实现导入草稿手动修改、AI 重新整理或批量正式化。
- 不新增正式 `ChapterPlan`，不改变现有 StoryStructure payload。
- 不恢复旧 `import_script_to_chapters` 整稿覆盖入口。

## 领域边界

1. `RawSourceVersion`：保存一次不可变完整原稿及其文档、稳定 block 引用。
2. `ImportAnalysisCandidate`：保存针对精确原稿版本的观察性大纲与拆章候选。
3. `ConfirmedChapterMap`：保存用户整体确认后的拆章目录；它是边界决议，不是章节计划。
4. `ImportBatch / ImportBatchItem`：表达一次整体创建和每章独立整理、验证、待确认、确认状态。
5. `ImportFidelityReport`：保存指定章节整理结果相对指定原稿范围的不可变忠实度证据。
6. `ChapterScriptPending`：复用现有正文待确认容器，但增加 `legacy | ai | import` 类型与密封来源集合。

## 阶段

1. Orchestrator：读取事实源、现有表和迁移规则，冻结模型与非目标。
2. Worker A：实现 Shared 来源快照、确认目录与 pending 来源投影契约。
3. Worker B：实现 Prisma 模型、0017 migration、运行时 ledger 和数据库约束。
4. Worker C：实现来源/导入状态仓储、pending 规则与生产状态兼容。
5. Scrutiny Review：只读复核事实源、状态机、迁移、测试和兼容风险。
6. Runtime/User Review：验证真实 SQLite 仓储路径；本包无页面接线，页面点击复核不适用。

## 验收标准

1. 相同原稿输入产生稳定引用和摘要；确认后的原稿、目录、忠实度报告不可原地修改。
2. 分析候选必须绑定精确原稿版本，只有无阻断问题的当前候选才能确认成目录。
3. 拆章目录确认后可创建一个批次和全部章节项，项目/章节/顺序/来源范围必须一致。
4. AI pending 必须密封绑定当前已确认大纲、目标章节卡和需要时的上一章正式正文。
5. Import pending 必须绑定原稿、分析、确认目录、批次项和无硬问题忠实度报告。
6. Import pending 不允许采用或丢弃，只允许后续“确认章节”形成正式版本。
7. 既有 legacy pending、页面 DTO 和下游门禁保持兼容；正式正文内容字段不变。
8. fresh SQLite migration、数据库约束、定向测试、全工作区 typecheck/test 和 `git diff --check` 通过。

## 退出标准

- 代码、测试、产品/架构事实源、任务记录和完成记录同步。
- Scrutiny Review 与 Runtime/Repository Review 都有明确结论。
- 当前阶段形成独立提交，Handoff 明确下一实施包的接线入口。

以上实现与复核项均已完成；独立提交在任务收口时形成。
