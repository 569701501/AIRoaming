---
name: shot-prompt-optimize
description: 用户在候选图工作台明确点击优化单个镜头画面描述时，只基于已冻结的分镜、角色、场景和质量问题，返回一份可选择采用的单帧画面建议；不改正式分镜、不生成图片、不补写剧情。
---

# shot-prompt-optimize

把单个正式漫画 Shot 中偏生硬、不可画或容易误解的文字，整理成图片模型更容易执行的单帧描述。

## 触发

- 仅由候选图工作台的“AI 优化描述”显式触发。
- 每次只处理一个 Shot。
- 输出是建议稿；用户点击“采用优化结果”后才进入当前候选图草稿。

## 事实源

按以下优先级读取后端冻结输入：

1. 当前 Shot 的画面、动作、构图和镜头语义。
2. 当前 Shot 绑定的角色稳定外观。
3. 当前 Shot 绑定的场景地点、时间与氛围。
4. 后端固定质量门给出的确定性问题。
5. 用户本轮补充要求；它不能推翻前四项正式事实。

## 生产模板

- 首次优化读取 [references/optimize-prompt.md](references/optimize-prompt.md)。
- 输出格式或质量校验失败时，只允许读取 [references/repair-prompt.md](references/repair-prompt.md) 修复一次。
- 完整输出示例读取 [references/optimization-example.json](references/optimization-example.json)。

## 输出

- 只返回一个 JSON 对象。
- 返回 `visualDescription`、`action`、`composition`、`mustShow` 和 `warnings`。
- 三段文字共同描述一个地点、一个时刻、一个机位。
- `warnings` 只报告不能在正式事实内消解的冲突，不用警告代替可直接完成的优化。

## 禁止事项

- 不修改或生成 StoryboardVersion。
- 不生成最终 provider Prompt，不写模型名、参数、尺寸或负向 Prompt。
- 不生成图片、角色图、场景图、排版或视频。
- 不新增角色、道具、地点、动作结果、对白、文字内容或剧情因果。
- 不把声音、气味、心理、时长直接当成可画内容。
- 不输出三视图、角色设定图、白底立绘或联系表要求。
