---
doc_id: AIR-TASK-20260716-DOWNSTREAM-PROMPT-RUNTIME
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 新项目 fake-provider Chromium 验证
---

# Runtime / User Review

结论：`passed_isolated_fake_provider`

- 在隔离环境新建项目并进入候选图工作台，没有读取或修改既有项目数据。
- 通过 fake provider 为当前分镜准备 3 张候选图，provider 共收到 3 次图片生成请求。
- 页面“干净底图 Prompt”可展开查看，包含主体与静态瞬间、动作与情绪、构图与视觉重心、景别与机位、角色身份与外观、环境/光线/氛围、漫画画风。
- 页面文本明确生成一张干净漫画底图、一个场景和一个静态瞬间；未出现固定 `Avoid:`、整页竖版漫画、对白气泡或多格拼贴要求。
- E2E 1/1 通过，run ID `g0-55469-mrngweuf-393f04dc`。
- 截图证据：`evidence/candidate_prompt_preview.png`。

本复核没有调用真实图片 provider，因此不对实际图像的审美、角色相似度或供应商差异作结论。
