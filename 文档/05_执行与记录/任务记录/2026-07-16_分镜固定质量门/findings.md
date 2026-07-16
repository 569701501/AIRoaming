---
doc_id: AIR-TASK-20260716-STORYBOARD-S2-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md 与代码探索
---

# 发现与证据

## 当前事实

- `dialogue-json.util.ts` 的 `normalizeStoryboardShot` 会为新 AI 输出补默认枚举、默认 order、空文本和默认时长；这是历史兼容器，不是合格的生产输出校验器。
- `storyboard-reference.util.ts` 已能阻断未知 beat/scene/character，但只检查“引用是否存在”，不检查“全部 beat 是否覆盖”和“Shot 是否按 beat 顺序排列”。
- `StoryboardDialogueService.generateStoryboardWithAI` 当前只有一次模型调用；任意失败直接返回失败，未使用剧情结构阶段已经验证的“一次定向修复”模式。
- pending 保存发生在完整 AI 调用和引用映射之后，因此把严格解析、固定质量门和修复放在 `generateStoryboardWithAI` 内即可保证失败不写入。

## 决策

- 兼容 normalize 不改职责；新增严格 AI 输出契约，避免迁移/历史读取被新规则误伤。
- 质量门只处理可由当前 StoryStructure 与 Shot 自身确定的错误，不做主观审美评分。
- 格式、字段、引用和质量错误共用一次修复预算，防止多层各自重试造成隐形循环。

## 完成后事实

- `assertStoryboardGenerationOutputContract` 只用于当前新 AI 分镜产出；项目历史数据仍通过 Shared normalize 兼容读取。
- `assertStoryboardQuality` 不修改输入，只对当前结构可证明的高确定性错误失败关闭；“镜头够不够好看”仍由 Prompt 自检、用户判断和后续真实模型验收承担。
- 格式、质量和引用映射在同一校验闭环中共用一次修复总预算；引用失败不会绕过门禁直接落库。
- 新建项目无头浏览器路径通过页面对话明确生成分镜，首次漏 beat、第二次修复完整，只形成 pending，用户确认门保持不变。

## 剩余边界

- 本轮没有调用真实文本模型或图片 provider，因此不证明真实模型的商业节奏、画面美感或图片一致性。
- 当前质量门覆盖正式用户分镜对话入口。若未来把更底层的 `shot_generate` 任务暴露为独立用户入口，必须复用同一 validator，不得建立第二套宽松准入路径。
