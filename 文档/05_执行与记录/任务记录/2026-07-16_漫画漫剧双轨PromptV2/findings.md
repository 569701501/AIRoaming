---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-V2-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 当前代码、正式方案与测试
---

# 漫画 / 漫剧双轨分镜 Prompt V2 发现

## 已确认事实

- 生产入口为 `apps/server/src/dialogue/dialogue-prompt.util.ts#buildStoryboardPrompt`，generate 与 revise_pending 共用。
- 当前 `StoryboardShot` 已有共同核心、`comic` 和 `motion`；页面和解析器不需要新增字段。
- 当前 M1 共用镜头数量、order、beatId、sceneId、characterIds、shotType 和 cameraAngle，属于兼容限制。
- 当前 Prompt 的主从表述与 2026-07-16 双轨决策冲突，应在本轮删除。
- `assertStoryboardQuality` 没有比较 `comic.panelDescription` 与 `motion.visualDescription` 是否相同；现有硬门只要求漫画对白在 motion voiceLines 中保留对应正式台词，因此不需要为了双轨分开而放松质量门。
- `buildStoryboardRepairPrompt` 仍把所有 Shot 写成“静态瞬间”，也必须同步拆分漫画静态和漫剧时间过程，否则首次生成虽修正，修复轮仍会把 motion 拉回漫画附属层。

## 风险

- Prompt 分轨不等于数据序列已独立；不能在完成记录中声称支持漫画与漫剧不同镜头数。
- 当前单一 `promptDraft` 只供静态候选图使用，不能误称为漫剧 Prompt。
- 硬门仍可检查正式对白和剧情结果不冲突，但不应要求两轨描述文字或决定性瞬间完全相同。

## 实施发现

- `buildStoryboardPrompt` 可以在不改变返回 JSON 的情况下按“共享事实 → 漫画 → 漫剧 → 双轨边界”组合四段内部 Prompt。
- 当前单一 `promptDraft` 明确归静态候选图使用；漫剧暂以现有 `motion` 字段为未来动态 Prompt 编译器提供结构化输入。
- 视觉锚点只能要求模型遵守实际输入中可见的 `visualTraits`、`artStyle` 与可选资产描述，不能暗示模型读取了未注入的角色图片。
- 全量 Server 回归共 684 项；唯一未在固定 5 秒内完成的是既有备份恢复集成测试，隔离并把测试超时放宽到 60 秒后通过，未出现断言失败。
- 本轮没有执行 V1/V2 真实模型 A/B；旧 S3 真实模型结果属于旧 Prompt 基线，不能作为 V2 动态表现质量证据。
