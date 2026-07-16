---
doc_id: AIR-TASK-20260716-STORYBOARD-PROMPT-INVENTORY-FINDINGS
status: in_progress
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 分镜及后续文档、生产代码和测试探索
---

# 分镜及后续提示词盘点发现

## 初步发现

- 项目已有分镜工作台、分镜字段拆分、AI 质量与提示词工程、项目提示词资产盘点、七阶段缺口与升级顺序等文档。
- 当前生产代码包含 `StoryboardDialogueService` 与动态 Prompt 工具；没有发现与剧本五个 Skill 同级的正式 storyboard Skill 目录，需要进一步确认这是有意边界还是缺口。
- 分镜下游已经存在版本化 Storyboard、Shot、出图准备和候选图契约，Prompt 调整不能只看文案，必须对齐这些现有字段与来源门禁。

## Scrutiny Review

待执行。
# findings

## 当前事实

- 分镜按章节生成；已确认剧情结构是唯一进入条件；用户必须明确触发，不能自动生成。
- AI 生成结果先进入待确认草稿，用户确认后才形成正式 StoryboardVersion 并解锁下游。
- 现有页面字段足够，本轮不需要新增或删改。
- AI 创作与已有剧本导入在 StoryVersion 汇合，分镜阶段只需要一套下游 Prompt。

## 生产缺口

- 当前 Prompt 对 JSON 契约详细，但缺少 beat 覆盖、连续性、漫画阅读节奏、视觉变化和双表达一致性的固定质量门。
- Prompt 使用 `over_the_shoulder`，正式枚举使用 `over_shoulder`，兼容层会静默降级为 `eye_level`。
- Prompt 让 AI 在 `characterIds` 填角色名，正式数据库要求项目角色 ID；当前需要明确 AI 本地引用、DTO 映射、数据库正式 ID 三层边界。
- 生成服务只有一次模型调用和宽松 normalize，没有“固定校验 + 一次定向修复”。
- 页面文案支持“调整节奏”，但后台目前只把“生成/重新生成分镜”当作分镜生成动作，没有独立的待确认草稿修订流程。

## 文档有效性

- `核心用户流程.md`、共享 DTO / Storyboard V2 和 ADR-0007 是当前事实。
- 2026-07-09 提示词盘点对 P06“契约强、创作方法弱”的判断仍有效，但旧代码规模和图片 Prompt 前后端分裂结论已过期。
- 2026-06-21 分镜字段调研可用于理解字段来源，不能再用来判断当前字段是否被下游消费。
- 出图准备是确定性检查，不是下一项创作 Prompt；候选图已有服务端统一生成规格；场景参考图 Prompt 仍偏薄。

## 最终顺序

1. S1 分镜生成契约、待确认草稿调整动作与引用映射。
2. S2 固定质量门与一次定向修复。
3. S3 固定测试和双来源真实模型验收。
4. S4 场景参考图 Prompt。
5. S5 候选图真实图片评测与少量 provider profile。
