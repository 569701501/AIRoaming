---
name: structure-story-parse
description: 用户明确要求为当前章生成或重新生成剧情结构时，读取该章精确的已确认正式剧本版本，忠实提取摘要、方向、角色卡、场景卡和剧情节拍，返回待确认结构候选；禁止用大纲补写正文、生成分镜、输出数据库 ID 或自动确认。
---

# structure-story-parse

把当前章节的已确认正式剧本转换成可检查、待确认的剧情结构，为漫画和漫剧分镜提供共同事实层。

## 触发条件

- 用户明确要求生成、提取或重新整理当前章剧情结构。
- 后台 `story_parse` 任务处理一个精确的正式章节剧本版本。

切换章节、保存剧本、完成章节或裸“继续”都不自动触发。正式剧本为空或版本不明确时不得生成。

## 事实源

按以下优先级读取：

1. 本次任务绑定的精确 `ChapterScriptVersion` 正文。
2. 项目级剧本大纲，只用于理解世界观和角色名称。
3. 用户本轮对提取方式的明确补充要求。

正式章节正文是本章实际剧情的唯一事实源。顶部方向摘要与正文冲突时，以正文、正文场景结束点和本章结尾为准。不得把大纲中尚未发生的事件写进当前章。

## 生产模板

- 正常提取：读取 [references/story-structure-prompt.md](references/story-structure-prompt.md)。
- JSON 语义示例：读取 [references/story-structure-example.json](references/story-structure-example.json) 并填入主模板。
- 可解析但固定质量门失败：读取 [references/repair-quality-failure.md](references/repair-quality-failure.md)。
- JSON 解析或字段契约失败：读取 [references/repair-validation-failure.md](references/repair-validation-failure.md)。

这些 reference 是生产 Prompt 事实源。后端只能注入动态事实、解析语义输出、执行固定质量门、做一次定向修复，并补充本地引用和数据库关联；不得在代码中另存一套同义提取规则。

## 输出契约

- 只返回一个完整 JSON 代码块。
- 语义字段保持现有页面所需的 `synopsis`、`direction`、`characters`、`scenes`、`beats` 和 `notes`。
- AI 用角色名和场景名建立关联，不生成 `chapterId`、版本 ID、角色/场景/节拍 ID、`projectCharacterId`、时间戳或状态字段。
- 对话路径输出只进入待确认预览；用户确认后才形成正式剧情结构版本。
- 后台任务由后端把同一语义输出转换成当前正式文档协议。

## 固定质量边界

- 正文明确列出的每个场景必须且只能对应一个场景卡，顺序和场景事实保持一致。
- 每个正文场景至少由一个剧情节拍承接，Beat 顺序从 1 连续递增。
- 角色覆盖正文明确出场人物；正文没有的信息留空，不猜测动机、关系或视觉特征。
- Beat 只引用已输出的角色名和场景名，并写清事件、冲突或转折、结果与轻量画面重点。
- 剧情结构粒度必须比分镜粗，不输出景别、机位、构图、图片 Prompt 或分镜编号。
- P6 固定检查和一次修复由后端执行，模型自评不能代替放行。

## 禁止事项

- 不改写、补写、删减或“优化”正式章节正文。
- 不为了三幕式、黄金钩子或其他理论强行重构原文。
- 不创建项目级角色库或场景库。
- 不生成分镜、图片、配音、排版或素材包。
- 不输出评分、检查报告、推理过程、数据库 UUID 或额外字段。
- 不绕过用户确认直接形成正式版本。
