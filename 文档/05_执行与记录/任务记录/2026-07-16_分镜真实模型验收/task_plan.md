---
doc_id: AIR-TASK-20260716-STORYBOARD-S3-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 分镜及后续提示词改造顺序 S3 与用户授权
---

# 分镜真实模型验收 S3 任务计划

## 目标

在独立 SQLite、workspace 和两个新建项目中，使用真实 `self/gpt-5.5` 验证 AI 创作与已有剧本导入两种正式 StoryVersion 能否共用同一分镜 Prompt、S2 固定质量门和用户确认流程。

## 非目标

- 不调用真实图片 provider，不生成或评测候选图。
- 不改页面字段、Storyboard Schema、数据库或确认节点。
- 不把两个样例冒充所有题材、节奏和艺术质量的穷尽验收。
- 不因真实模型一次失败而放宽 beat 覆盖、引用、顺序或 `promptDraft` 污染硬门。
- 不读取、修改或删除现有用户项目。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| S3-0 事实源与环境 | Orchestrator | completed | 真实模型可用，隔离根、数据库和端口明确 |
| S3-1 AI 创作来源 | Runtime/User Review | completed | 新项目的正式 StoryVersion 生成 pending 分镜，用户确认后发布 |
| S3-2 导入来源 | Runtime/User Review | completed | 导入正式 StoryVersion 生成 pending 分镜，用户确认后发布 |
| S3-3 一致性与失败处置 | Worker | completed | 对比两路 Prompt/质量门/版本来源；真实缺陷仅做最小修复 |
| S3-4 复核与留痕 | Scrutiny Review | completed | 数据库、页面、证据、文档和工作树一致 |

## 强制验收标准

1. 两个项目均为本轮隔离环境内新建，不触碰既有项目数据。
2. 两路分镜都只读取当前已确认 StoryVersion 及其绑定的正式 ScriptVersion。
3. 真实模型输出通过严格契约、S2 质量门和结构引用映射；如触发修复，精确记录首次错误和唯一修复结果。
4. 生成后只形成 pending，正式 StoryboardVersion 在用户确认前不存在，章节不推进。
5. 用户确认后，StoryboardVersion 精确绑定当前 StoryVersion，章节进入 `storyboard_done`，出图准备解锁。
6. 两路使用同一个 `storyboard-shot-generate` Prompt 契约，不按上游来源复制两套分镜逻辑。
7. 页面无本轮新增 error/warn，SQLite `integrity_check=ok`。

## 退出标准

- Runtime/User Review 给出 `passed_real_model`、`failed_real_model` 或 `blocked` 明确结论。
- Scrutiny Review 核对 ScriptVersion → StoryVersion → StoryboardVersion 精确版本链。
- 更新三件套、Handoff、双 Review、功能完成记录、验收文档和长期记忆。
- 若发现代码缺陷，先保留失败证据，再用独立最小修复与回归收口。
