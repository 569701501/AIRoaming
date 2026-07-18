---
doc_id: AIR-FINDINGS-20260718-PROJECT-NAME-CREATIVE-ISOLATION
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 项目名与创作内容隔离诊断证据
---

# 发现

## 已证实

- A2 `script-inspiration-seeding` 明确要求结合项目名称，生产装配器注入 `snapshot.project.name`。
- A2 直接使用专用 Prompt；通用对话 Prompt 和 OpenCode 会话标题不是本次直接根因。
- 项目创建仅输入名称时，服务端把名称同时写为 `storyTitle` 和 `description`。
- `PROJECT_NAME` 模板变量还出现在 A3、A4、A5、剧情结构和分镜 Skill；通用 Prompt 另有“当前项目”文本。
- 当前页面在 `storyTitle` 为空时本来就不展示故事标题，允许项目名和故事标题分离而不新增页面字段。

## 边界决策

- `Project.name` 是管理标签，不是故事内容。
- `storyTitle` 只有用户明确填写、确认大纲或正式剧本解析得到后才成为故事事实。
- 历史项目已有 `storyTitle` 不因本任务回溯清空。
- 用户明确在本轮消息里写出项目名时，模型仍可使用该文本；系统不额外注入。

## 待复核风险

- 旧 file-mode 和 DB 历史记录可能已经把项目名复制到 `storyTitle`；本任务不做破坏性迁移，而是在模型 Prompt 边界识别同值副本并降级为“未确认”。
- OpenCode session 标题仍可使用项目名，因为它只作会话管理元数据；实际消息正文和工具输出均不再包含管理名。
- 全量测试中的一个迁移用例在并发重负载下耗时刚好超过 5 秒，独立运行恢复为 12/12；属于既有测试时限抖动，不是本次功能回归。

## 最终结论

根因和所有已知旁路均已处理。旧项目数据不迁移，但同值 `storyTitle` 不再进入模型；旧对话中已经生成的候选不会被静默改写，需要用户主动“换一批”生成新候选。
