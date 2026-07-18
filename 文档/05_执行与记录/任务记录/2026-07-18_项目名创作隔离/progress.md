---
doc_id: AIR-PROGRESS-20260718-PROJECT-NAME-CREATIVE-ISOLATION
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 项目名与创作内容隔离任务
---

# 进度

## Orchestrator

- 已复现 A2 Prompt 明确注入项目名，并确认直接根因位于 Skill reference 与动态 Prompt 装配。
- 已确认 A3、A4、A5、剧情结构、分镜和通用对话存在同类注入，需要按全链路规则处理。
- 已确认项目创建会以 `name` 兜底 `storyTitle/description`，形成次生污染风险。
- 当前未修改生产代码，下一阶段先补回归测试。

## Worker 1：失败回归

- 在真实生产 Prompt 装配器加入管理名哨兵，旧实现出现 11 个预期失败；A2、A3、A4、A5、通用对话、剧情结构、分镜、后台任务和角色参考图均能复现管理名进入模型上下文。
- DB-only 真实创建/重启测试复现：只填项目名称时，返回的 `storyTitle` 被静默设置为项目名。

## Worker 2：实现

- 六个创作/结构/分镜 Skill 的生产 reference 移除 `PROJECT_NAME`，对应 `SKILL.md` 写明管理名隔离规则。
- TypeScript 动态装配不再传 `PROJECT_NAME`，通用对话不再输出“当前项目”，AI 状态工具不再把项目名格式化给模型。
- 新建项目未明确提供标题/描述时保存为空；DB 使用 `NULL` 表示未设置，Local/DTO 投影继续使用空字符串兼容现有页面类型。
- 项目改名、标题清空和描述清空不再互相兜底；无有效大纲标题时使用中性“未命名故事”，不使用项目管理名。
- 角色参考图、剧情结构和分镜在 `storyTitle` 为空或与管理名同值时使用“未确认”，覆盖旧项目自动复制值而不迁移数据库。

## Worker 3：验证

- 六个修改过的 Skill 通过 `quick_validate.py`。
- 管理名专项：4 个文件、34/34 通过。
- DB-only 创建/重启专项：1/1 通过，验证 DTO 为空且数据库 `story_title/description` 为 `NULL`。
- 全项目类型检查通过；全项目构建通过。
- Server 全量最终运行：123/124 文件、742/743 项通过；唯一失败为无关的 `g1-migration-plan` 5 秒资源超时。该文件随后独立重跑 12/12 通过；同一全量在本任务较早生产版本上曾 124/124、742/742 通过。
- 未调用真实文本模型、图片 provider 或任何付费服务。

## Scrutiny Review

- 结论：通过。未修改页面、Shared DTO、数据库 Schema、迁移、章节/结构/分镜字段或确认流程。
- 项目名仍只在 OpenCode session 标题等管理元数据中使用，不进入模型消息正文。

## Runtime/User Review

- 离线生产 Prompt 装配和真实 SQLite 创建/重启路径通过。
- 本任务无页面改动，且真实模型调用会产生费用，因此没有执行付费模型浏览器路径；用户重启应用后在原 `1111` 项目中“换一批”即可完成最终人工观察。
