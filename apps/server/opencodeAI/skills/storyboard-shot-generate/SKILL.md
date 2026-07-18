---
name: storyboard-shot-generate
description: 用户在分镜阶段明确要求生成当前章分镜或调整当前待确认分镜时，读取已确认剧情结构和绑定的正式章节正文，生成同时包含独立 comic 与 motion 表达的完整待确认 Shot 数组；禁止自动确认、生成图片或编造剧情事实。
---

# storyboard-shot-generate

把当前章节已确认的剧情结构转换为可编辑、待确认的漫画/漫剧双轨分镜。

## 动作

- `generate`：首次生成当前章完整待确认分镜。
- `revise_pending`：按用户要求调整当前待确认分镜，返回新的完整分镜，不返回 patch。

只在用户明确要求当前章生成或调整时执行。切换章节、确认剧情结构和裸“继续”都不触发。

## 事实源

按以下优先级读取：

1. 当前章节已确认 `StoryStructureVersion`。
2. 该结构绑定的正式 `ChapterScriptVersion`，只用于动作和逐字对白来源。
3. 当前待确认分镜，仅在 `revise_pending` 中使用。
4. 用户本轮明确调整要求。

不得把未确认聊天、未来章节或项目大纲中尚未发生的内容写成当前章事实。

## 生产模板

- 首次生成和调整：读取 [references/storyboard-prompt.md](references/storyboard-prompt.md)。
- 有稳定全章对白候选：把 [references/dialogue-with-candidates.md](references/dialogue-with-candidates.md) 填入主模板。
- 无稳定全章对白候选：把 [references/dialogue-without-candidates.md](references/dialogue-without-candidates.md) 填入主模板。
- `generate`：把 [references/mode-generate.md](references/mode-generate.md) 填入主模板。
- `revise_pending`：把 [references/mode-revise-pending.md](references/mode-revise-pending.md) 填入主模板。
- `generate` 的完整 JSON 示例：读取 [references/shot-example-generate.json](references/shot-example-generate.json)。
- `revise_pending` 的完整 JSON 示例：读取 [references/shot-example-revise-pending.json](references/shot-example-revise-pending.json)。
- `revise_pending` 的当前草稿区：读取 [references/pending-storyboard-section.md](references/pending-storyboard-section.md)。
- 仅在明确运行 `v2_5_experiment` 时追加 [references/risk-v2-5.md](references/risk-v2-5.md)。
- 固定门失败后的唯一修复：读取 [references/repair-prompt.md](references/repair-prompt.md)，并按动作追加对应 repair mode 文件。

这些 reference 是生产 Prompt 事实源。后端只能填充 `{{PLACEHOLDER}}`、校验输出和保存版本，不得在代码中另存一份同义创作规则。

## 输出

- 只返回一个 JSON 代码块。
- 顶层为 `{ "shots": Shot[], "notes": string }`。
- 每个 Shot 同时包含共同核心、`comic` 和 `motion`。
- AI 使用剧情结构本地引用；数据库 ID 由后端映射和分配。
- 输出只进入 pending；用户确认后才形成正式 `StoryboardVersion`。

## 禁止事项

- 不生成整部作品分镜。
- 不直接生成图片、视频、TTS、字幕、排版或素材包。
- 不把 motion 写成 comic 的动态复述，也不要求两者描述同一瞬间。
- 不改写正式剧情、对白或角色身份。
- 不输出数据库 UUID、评分、诊断过程或额外字段。
- 不绕过后端固定质量门和用户确认。
