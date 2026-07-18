---
doc_id: AIR-TASK-20260718-STRUCTURE-PROMPT-PLAN
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 用户确认继续推进 Prompt Skill 归位
---

# 任务目标

把剧情结构生成的稳定创作规则迁入 OpenCodeAI Skill，并消除对话生成与后台 `story_parse` 任务的两套 Prompt。

# 非目标

- 不改现有剧情结构页面展示字段。
- 不改“生成预览—用户确认—正式版本”的交互。
- 不改数据库 Schema、任务类型或下游分镜协议。
- 不调用真实付费模型或图片服务。

# 阶段

1. 冻结字段、事实源和现有运行路径。
2. 创建 `structure-story-parse` Skill 与严格模板、示例、修复模板。
3. 统一对话和后台任务装配入口，补齐后端 ID 转换。
4. 增加来源卫生、Prompt、质量与任务回归测试。
5. 完成静态复核、离线运行复核、Handoff 与文档留痕。

# 退出标准

- 两条生产路径都从同一 Skill 读取稳定 Prompt。
- AI 输出不再承担数据库 ID、版本号和时间戳。
- 后台路径同样执行现有固定质量检查与一次定向修复。
- 页面字段、确认流程和正式 `StoryDocumentV2` 协议保持不变。
- Skill 校验、目标测试、服务端全量测试、类型检查和构建全部通过。
