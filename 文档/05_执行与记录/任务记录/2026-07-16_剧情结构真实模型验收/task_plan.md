---
doc_id: AIR-TASK-20260716-STORY-STRUCTURE-REAL-MODEL-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A+ 双流程正式章节汇合点与剧情结构固定质量门
---

# 剧情结构真实模型验收任务计划

## 目标

在独立 SQLite、独立 workspace 和新建项目中，使用真实 `self/gpt-5.5` 验证 AI 创作与完整剧本导入形成的正式章节，都能按当前页面流程生成、预览并确认剧情结构。

## 非目标

- 不改变 A1～A5、B1～B5、页面字段、StoryStructure Schema 或确认动作。
- 不评审完整商业质量，不增加评分面板或新的结构产物。
- 不读取、修改或删除现有项目数据库和 workspace。
- 不因模型非确定性放宽正文来源、场景覆盖、人物引用或 beat 完整性硬门。

## 阶段与状态

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| 事实源与环境 | Orchestrator | completed | 模型可用，隔离根、数据库与页面端口明确 |
| AI 创作路线 | Runtime/User Review | completed | 新项目正式章节生成剧情结构预览并确认 |
| 已有剧本路线 | Runtime/User Review | completed | 新项目导入正式章节生成剧情结构预览并确认 |
| 失败样例处置 | Worker | completed | 未发现真实误杀、漏拦或运行缺陷，本轮不改代码 |
| 静态复核与留痕 | Scrutiny Review | completed | 证据、数据库来源绑定、文档和工作树一致 |

## 验收标准

1. 两个新项目均在隔离数据库中创建，不触碰现有项目。
2. AI 创作项目和已有剧本项目各至少一个正式 `ChapterScriptVersion`。
3. 两章结构均只绑定各自当前正式 `sourceScriptVersionId`。
4. 结构预览包含方向、人物、场景和连续 beat；确认后章节进入 `structured`。
5. 页面允许进入分镜工作台；浏览器控制台无本轮新增错误。
6. 若质量门拒绝，记录首次输出、修复结果与具体错误；不得把失败伪报为通过。

## 退出标准

- Runtime/User Review 给出 `passed_real_model`、`failed_real_model` 或 `blocked` 明确结论。
- Scrutiny Review 检查来源版本、结构内容与页面状态一致。
- 更新三件套、会话记忆、验收记录和长期记忆；若有代码修复则执行相应自动回归并形成独立提交。

## 最终结论

`passed_real_model`

- AI 创作正式章节：3 个角色、7 个场景、15 个连续剧情节拍。
- 已有剧本导入正式章节：3 个角色、1 个场景、6 个连续剧情节拍。
- 两份 StoryVersion 均精确绑定各自当前正式 ChapterScriptVersion，确认后章节进入 `structured` 并解锁分镜。
- 未发现需要修改代码的质量门缺陷；页面字段、流程和确认动作保持不变。
