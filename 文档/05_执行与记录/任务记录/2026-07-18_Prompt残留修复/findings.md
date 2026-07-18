---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-FIX-FINDINGS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: Prompt 残留修复代码探索
---

# 发现

## 分镜旁路

- 持久 `shot_generate` 能读取 `Project`、当前已确认 `StoryVersion` 及其绑定的正式 `ChapterScriptVersion`。
- 完整分镜路径已有可复用的 Skill Prompt、对白候选编译、输出契约、固定质量门和修复 Prompt。
- 数据库 Storyboard V2 要求正式 Shot ID；模型生成仍应省略 ID，由后端映射引用并分配。

## 图片 Prompt

- provider 参考图职责在最终请求前追加，最适合纳入 `provider-profiles.json` 并由 provider 编译工具填充图片序号和标签。
- 画风和漫画格式 Prompt 词汇只被参考图构造器消费，可迁入 `reference-defaults.json`；Shared 只需保留用户展示定义。

## 防回流

- 应对已发现的稳定词句建立源码检查，同时保留行为测试证明真实 Prompt 仍由 Skill 编译得到。

## 最终结论

- 复核发现的 4 类生产残留已经关闭。
- 分镜对话路径和持久任务路径现在共享 `buildStoryboardPromptFromFacts()`，共同读取 `storyboard-shot-generate`，不再有第二套简化分镜创作方法。
- provider 网关仅选择实际使用的参考图并填入图片序号、标签；参考图职责正文由 Skill Profile 决定。
- 参考图构造器只按枚举读取 Skill 词汇；页面和 Shared 继续保存用户展示定义，不再承担图片 Prompt 词汇表职责。
- P6 evaluator 和剧本/导入/剧情结构历史 Prompt 仍在代码中，但不属于本次 3 个 Skill 的生产残留验收；应作为后续渐进迁移项，不能误报为已完成全项目 Prompt 归位。
