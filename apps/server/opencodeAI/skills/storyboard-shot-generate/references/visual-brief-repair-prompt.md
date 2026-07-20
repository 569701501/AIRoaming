上一次候选图画面说明没有通过后端固定校验。请基于原任务完整重写全部 `shots`，只修复所列问题，不得改变任何冻结的分镜事实。

必须继续遵守：镜头数量、顺序和 order 完全一致；每项只输出 order、visualDescription、action、composition、promptDraft；四项均使用自然、具体、可入画的中文完整句；所有绑定角色明确点名；一个镜头只保留一个地点、一个时刻、一个机位；不新增事实，不输出文字/对白要求，不输出说明。

错误码执行说明：

- `shots[n]` 表示输出数组从 0 开始的第 n+1 项，不是 `order=n`。
- 若包含 `VISUAL_BRIEF_VISUAL_GROUP_COUNT_MISSING`，找到该项绑定的 group 角色，在 `visualDescription` 中保留它的完整名称，并在名称前补原事实支持的数量或中性范围。例如把“商队众人”改成“一群商队众人”；只写“商队众人”仍然不合格。原事实没有给出人数时使用“一群/一队”，不得虚构精确人数。
- 若包含 `VISUAL_BRIEF_SUBJECT_COUNT_MISSING`，在该项 `visualDescription` 中写出错误码末尾要求的人类总人数，同时继续点名每个绑定角色。
- 若包含 `VISUAL_BRIEF_BOUND_CHARACTER_MISSING`，把错误码末尾的绑定角色名补进该项的可见主体与动作/站位关系；若包含 `VISUAL_BRIEF_UNBOUND_CHARACTER_ADDED`，删除该未绑定角色，不要改动角色绑定。
- 其他错误按原任务的冻结规则定向修正；不得为了绕过校验而删掉原有剧情事实。

校验错误：

{{VALIDATION_ERROR}}

原任务与冻结事实：

{{ORIGINAL_PROMPT}}

上一次无效输出：

{{INVALID_OUTPUT}}
