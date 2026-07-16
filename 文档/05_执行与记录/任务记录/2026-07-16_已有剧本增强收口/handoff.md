---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-ENHANCEMENT-HANDOFF
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: reviewer, developer, qa
source: task_plan.md
---

# Handoff

## 交付结论

三个目标均已实现，未新增 migration、ChapterPlan 或页面内容字段。目录确认只落库并唤醒后台；长稿使用隔离模型 session 做叶子分析和递归合并；页面读取数据库批次投影并只允许失败章单独重试。

## 关键不变量

- 原稿不可变，分析和整理不得覆盖原稿。
- 技术分段不是剧情章节边界；最终分析必须覆盖全部 block。
- `ScriptImportBatch/Item` 是唯一进度事实源。
- import pending 仍只读，不提供采用、丢弃、手动/AI 重新整理。
- 单章确认才产生正式版本，其他章节状态不阻断本章下游。

## 验证入口

- 长稿：`script-import-analysis.service.spec.ts`、`script-workflow-state.spec.ts`。
- Worker：`script-import-worker.service.spec.ts`、`script-import-batch.service.spec.ts`。
- 用户路径：`script-import-existing-flow.spec.ts`。
- 全量：Shared 153、Server 594、typecheck 通过。

## 残留边界

当前执行器只支持本地单服务进程；多实例部署前必须增加 lease。最终合并 JSON 超出模型输出能力时仍会失败，这是诚实失败，不得改成跳过中段。
