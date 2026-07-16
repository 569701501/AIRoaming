---
doc_id: AIR-TASK-20260716-STORYBOARD-S1-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 分镜及后续提示词改造顺序 S1
---

# 分镜生成契约 S1 任务计划

## 目标

在不改变当前页面字段、确认门和数据库 Schema 的前提下，完成分镜首次生成、待确认草稿 AI 调整，以及 AI 本地引用到正式 Storyboard Working Copy 的受控映射。

## 强制验收

1. `over_shoulder` 与正式枚举一致，不再静默降级。
2. AI 只输出剧情结构内的 beat、scene、character 本地引用，不生成数据库 UUID。
3. 后台把角色引用映射为项目 Character ID，并为新镜头分配正式 Shot ID。
4. 数据库模式下，生成结果直接形成可刷新、可编辑、可确认的 pending Storyboard Working Copy。
5. 用户说“调整分镜节奏/重写镜头”时，只修订当前待确认草稿；没有草稿时不擅自修改正式分镜。
6. 文件模式继续兼容。

## 非目标

- 本轮不实现 S2 的完整固定质量门和一次定向修复。
- 不增加页面字段、数据库表或用户确认节点。
- 不修改候选图、排版或素材包。
- OpenCode `skills/` 当前未接入运行时复制，本轮不创建无法被生产调用的孤立 `SKILL.md`；生产动态 Prompt 是本轮实际入口。

## 阶段

| 阶段 | 状态 | 退出标准 |
| --- | --- | --- |
| 契约冻结 | completed | generate / revise_pending 和三层引用边界明确 |
| Prompt 与意图 | completed | 两个动作可被正确识别并生成完整草稿 |
| DB Working Copy 接线 | completed | 新镜头和角色引用可形成正式 pending 文档 |
| 验证与复核 | completed | 定向测试、类型检查、构建和静态复核通过 |

## 结果

S1 强制验收全部完成。页面字段、数据库 Schema、用户确认门和下游流程均未变化；下一阶段进入 S2 固定质量校验与一次定向修复。
