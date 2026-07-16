---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-V21-PROGRESS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 漫画 / 漫剧双轨分镜 Prompt V2.1 进度

## 2026-07-16：V21-0 开始

- 已读取 `$deep-think`、项目事实源、V2 正式方案、上一轮真实 A/B 逐镜复核和当前生产 Prompt / 测试。
- 上一轮正式结论为 `MIXED / V2_DIRECTIONALLY_BETTER`；V2 不回退，本轮只处理单镜动态负载和正式对白同义改写。
- 确认当前生产调用链仍是 `buildStoryboardPrompt` → `self/gpt-5.5` → 严格解析 / 固定质量门 → 最多一次 `buildStoryboardRepairPrompt`。
- 当前 `compactPromptText(..., 6000)` 只注入正式正文头尾摘录；V2.1 的逐字对白规则只能约束摘录中可见台词，不能虚假宣称核对整章全部原文。

## 2026-07-16：V21-1 测试先行

- 先在 `dialogue-creative-prompt.spec.ts` 增加单镜负载、第二镜触发、漫画填充保护、两镜上限、非机械切分与正文摘录逐字对白契约。
- 旧 V2 定向测试按预期出现 3 个失败、11 个通过，失败均为缺少 V2.1 新规则，不是既有行为回归。

## 2026-07-16：V21-2 Prompt 实施

- 首次生成与 pending 调整共用的 motion Prompt 已增加一个主要变化、`>2` 显著状态变化 / `>3` 有内容 voiceLines 的第二镜评估、两镜上限和逐字对白规则。
- comic Prompt 已增加动态拆镜时的静态价值保护，禁止用重复反应、换景别或空画格填充。
- 共享 Shot 预算已把动态负载加入第二镜触发条件；一次修复 Prompt 使用相同规则。
- 没有修改 Schema、固定质量门、页面或用户确认流程。

## 2026-07-16：V21-3 静态验证

- 定向 Prompt 契约测试 14/14 通过。
- Prompt、固定质量门和生成服务相关测试共 3 个文件、27 个用例通过。
- `@airoaming/server` typecheck 和 build 通过；`git diff --check` 通过。

## 2026-07-16：V21-4 真实模型 A/B

- 从上一轮 storyboard 为 0 的 base DB 位对位复制到独立 V2.1 环境，复制前后 DB SHA-256 同为 `a72da9041095f5bba04c9fe03c8972d75d0422097725a4d6ea31dfc98ac47c76`。
- 使用与 V2 相同的 AI 创作/已有剧本项目、当前章、ScriptVersion、StoryVersion、`self/gpt-5.5` 与触发文本。
- AI 路线生成 19 镜，导入路线生成 11 镜；两路都只有 1 次 assistant 响应，即首次通过。
- 两路所有 beat / scene / character 引用合法，beat 全覆盖，页面控制台 error/warn 为 0。
- AI 路线可见正式对白 31/31 逐字命中；导入路线 6/6 逐字命中。
- 持久任务 worker 保持关闭；11 个历史角色参考任务仍全部 queued，running/succeeded 为 0，图片/视频/TTS/字幕调用为 0。

## 2026-07-16：V21-5 收口

- 形成 `ab-review.md`、Handoff、Scrutiny Review、Runtime/User Review 和完成记录。
- 正式判定为 `MIXED / V21_DIALOGUE_LOAD_BETTER_STATE_LOAD_UNRESOLVED`：保留 V2.1 的对白减负、逐字引用和漫画拆镜保护，但不宣称动态镜头负载已完全解决。
