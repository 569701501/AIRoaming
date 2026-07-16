---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V22-PROGRESS
status: complete
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 漫画 / 漫剧双轨分镜 Prompt V2.2 进度

## 2026-07-17：V22-0 开始

- 已读取 `$deep-think`、项目事实源、V2.1 Handoff、真实 A/B 和当前 Prompt/测试。
- 工作树初始为干净，基线提交为 `2a7dc1f`。
- 本轮不再增加第二个对白阈值，而是把“状态变化”改写为可识别的进入/聚焦变化/退出边界，并明确达到退出状态后立即停镜。

## 2026-07-17：V22-1 契约测试

- 新增状态边界、停镜点、五类新转换、不可分微动作、10 秒软复核与时长只为实际内容服务的契约断言。
- 在修改生产 Prompt 前，V2.1 定向测试如预期 2 失败 / 13 通过；失败点正是缺少 V2.2 新契约。

## 2026-07-17：V22-2 Prompt 实施

- 首次生成与 pending 调整共用的 motion Prompt 已增加状态边界、停镜点、新转换判定、微动作例外和三类可执行拆镜模式。
- `durationMs` 不再泛化表述为“给足时长”，改为只为实际保留的台词、主要动作和必要停顿服务。
- 10 秒只作为软复核触发；超过 10 秒且存在第二次状态转换时必须拆镜或缩小范围。
- 一次修复 Prompt 同步使用相同边界，定向契约测试 15/15 通过。

## 2026-07-17：V22-3 静态验证

- Prompt、固定质量门和分镜对话服务共 3 个测试文件、28 个用例通过。
- `@airoaming/server` typecheck 通过。
- `@airoaming/server` build 通过。
- `git diff --check` 通过。

## 2026-07-17：V22-4 真实 A/B

- 从 storyboard 为 0 的 base DB 复制独立 V2.2 runtime；复制前后数据库 SHA-256 同为 `a72da9041095f5bba04c9fe03c8972d75d0422097725a4d6ea31dfc98ac47c76`。
- 使用同一 AI 创作项目、导入项目、正式 ScriptVersion、StoryVersion、`self/gpt-5.5` 和触发文本生成 V2.2。
- AI 路线生成 23 镜、180.0s；导入路线生成 11 镜、59.9s。两路均首次通过，未进入修复。
- 两路结构引用全部合法，StoryboardVersion 均保持 `pending_confirmation`，console 0 error / 0 warn，付费媒体调用为 0。
- AI 样本超过 10 秒镜头从 V2.1 的 5 个降为 1 个，但最大 voiceLines 从 3 升到 9，11 个镜头超过 3 条；完整正式正文离线逐字命中 59/61。

## 2026-07-17：V22-5 收口与回滚

- 正式判定 `MIXED / V22_STATE_BOUNDARY_BETTER_DIALOGUE_LOAD_REGRESSED`。
- 状态边界改善不足以抵消对白减负和忠实性回退；V2.2 不替换 V2.1。
- 实验 Prompt 和契约测试已从生产代码回滚，保留规则、真实输出指标、截图和双 Review 作为后续 V2.3 输入。
- 完成 Handoff、静态复核、运行路径复核、正式方案更新、完成记录、会话记忆和长期记忆。
- 回滚后 V2.1 相关测试 3 files / 27 tests、server typecheck、server build 和 `git diff --check` 再次通过。
