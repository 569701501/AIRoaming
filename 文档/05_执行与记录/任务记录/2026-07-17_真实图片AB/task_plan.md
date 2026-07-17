---
doc_id: AIR-TASK-IMAGE-RUNTIME-AB-001
status: complete
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, qa
source: 用户明确授权执行 S4 固定 30 张真实图片 A/B
---

# S4 真实图片 A/B 任务计划

## 1. 目标

使用 `image-prompt-s4-baseline-v1` 的五类固定候选镜头，对 OpenAI、Doubao、Grok 分别执行每类 2 次真实生成，并保存可追溯证据与人工视觉结论。

## 2. 授权与预算边界

- 项目 provider 候选图请求最多 30 次：5 类 × 3 provider × 2 次。
- 请求失败也占用对应槽位，不自动重试。
- 不切换到其他 provider 补位，不扩大张数。
- 共享参考素材由内置图片生成能力单独制备，不读取或修改既有项目资产。
- 不输出、提交或记录 API Key、secretRef 和完整 fingerprint。

## 3. 固定范围

| Provider | 模型 | 固定案例数 | 每案例变体 | 最大请求数 |
| --- | --- | ---: | ---: | ---: |
| OpenAI | `gpt-image-2` | 5 | 2 | 10 |
| Doubao | `doubao-seedream-4-5-251128` | 5 | 2 | 10 |
| Grok | `grok-imagine-image-quality` | 5 | 2 | 10 |

固定案例：无角色远景、单人近景、双人对话、多人群像、场景特效。

## 4. 验收标准

- 每个真实请求绑定固定 case、provider、model、profile、Prompt digest、输入参考和输出文件。
- 记录 generation mode、used/omitted references、warnings、实际尺寸和错误。
- 10/10 不出现无关角色；10/10 目标比例正确；10/10 不复制章节标题、对白和旁白原文。
- 每 provider 至少 9/10 无文字、气泡、分格、边框、拼贴或设定表污染。
- 角色/场景一致性与构图按固定 case rubric 人工判定，provider 分开结论。
- 真实请求未完成时不得用离线基线或其他 provider 结果代替。

## 5. 阶段

### R0：授权、配置与素材预检

状态：`complete`

- 验证三家配置元数据和 Keychain 可读性，不输出秘密。
- 制备并检查 4 张角色预览、2 张场景参考。

### R1：真实 runner 与预算门

状态：`complete`

- 复用生产 Prompt builder 和 `ImageProviderService.generateCandidateImage`。
- runner 不修改 active provider 设置，不创建正式项目，不连接现有项目数据库。
- 预算计数先写入 attempt，再发请求；崩溃重启不得重复已发槽位。

### R2：30 槽位执行

状态：`complete`

- provider 串行、案例串行执行，保存每槽位结果。
- provider 首个请求若为明确配置/接口失败，停止该 provider 剩余槽位。

### R3：静态与视觉复核

状态：`complete`

- 自动检查文件、尺寸、Prompt/引用追溯和请求预算。
- 生成 contact sheet，逐图人工检查固定 rubric。
- 给出 provider 独立的通过/不通过/证据不足结论。

### R4：留痕与交接

状态：`complete`

- 更新 S4 方案、测试记录、任务三件套、完成记录和长期记忆。

## 6. 回滚

- runner 仅写本任务 evidence，不写既有项目、数据库或设置。
- 中断时保留已完成证据和 attempt 账本；不删除真实结果。
- 任何 provider 配置失败都只影响自身结果。

## 7. 最终结果

- 6 张共享参考资产完成并固化。
- 30 个槽位全部进入终态；实际发出 21 次请求，20 成功、1 失败、9 跳过，无重试。
- OpenAI 首次请求 503；Doubao 10/10 成功；Grok 10/10 成功。
- 人工视觉结论和归因见 `evidence/manual-visual-review.md`。
