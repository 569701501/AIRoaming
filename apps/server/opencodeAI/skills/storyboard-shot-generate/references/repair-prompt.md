{{FAILURE_INTRO}}

先从全章正式对白候选中删除非必要来回并完成最多两段分配，再为每段定义进入状态→唯一聚焦变化→退出状态；没有稳定候选时只能使用原任务正文摘录中明确可见的台词。每段 1～3 条只是复核触发，不是机械硬门。

每个剧情 beat 至少一个共享 Shot 锚点，Shot 按 beat 叙事顺序排列，并使用已有 beatId、sceneId 和角色卡 id；达到退出状态就停镜，新的独立反应、命令、障碍或行动目标进入第二镜；不按固定秒数机械切分。

comic 独立修复为一个可画的静态决定性瞬间、漫画构图、阅读节奏和气泡留白；因动态负载增加第二镜时，新增 comic 仍必须是不同且必要的静态决定性瞬间，不能用重复反应、换景别或空画格填充。motion 独立修复为开始状态→主要动作/表演变化→结束状态，并核对运镜用途、内容时长和尾首帧连续。

每个 motion 默认只保留一个主要动作或一次明确的信息/情绪变化；达到每 beat 两镜仍过载时缩小动作范围、保留关键台词并给足时长，不得把动作链重新塞回一镜。voiceLines[].line 必须逐字复制原任务中的全章正式对白候选，不得从未通过输出抄回改写句，也不得同义改写、补词或改标点。

所有必填文本、枚举、order、durationMs 和 voiceLines 必须合法；禁止空壳、占位和完全重复镜头。comic 与 motion 只需来自同一剧情锚点且事实不冲突，不要求描述同一瞬间、相同构图或相同节奏；漫画正式对白必须在 voiceLines 中保留对应台词。

promptDraft 只属于静态候选图，保留 comic 所需的主体、决定性瞬间、环境、光线、情绪和构图，不得泄漏对白原文、字幕、气泡、整页分格、模型名或 provider 参数。

固定问题代码按下面方式处理：

- `STORYBOARD_PANEL_TEXT_CONFLICT`：从 coreAction、comic.panelDescription、comic.composition 和 promptDraft 删除生成可读字迹、文字、数字、字幕或气泡的要求；保留同一剧情事实时，只写原任务已有的非文字信号、道具状态和人物可见反应，准确台词或旁白只进入对应语义字段。
- `STORYBOARD_VOICE_LINE_NOT_IN_FORMAL_SCRIPT`：从原任务的“全章正式对白/配音候选”逐字选择完整 `line`，没有适合本镜的候选就删除该 voiceLine 并相应调整 frameType/comic.dialogue；不要沿用失败输出里自行去掉或加上的表演提示、引号和标点。

{{REPAIR_MODE_CONTRACT}}

只返回一个完整 JSON 代码块，不要解释、评分、诊断或新增字段。

原任务与正式来源：

{{ORIGINAL_PROMPT}}

未通过的输出：

{{INVALID_OUTPUT}}
