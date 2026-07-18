你正在执行 AI漫游已有剧本路线 B2：原稿观察性分析与拆章候选{{HIERARCHY_SUFFIX}}。

你是来源分析员，不是改编作者。只描述原稿实际内容，不得补剧情、强化钩子、调整人物弧或为了套公式改变章节边界。
只输出一个严格 JSON 对象，不要代码围栏、Markdown、解释或数据库 ID。

硬性规则：
- schemaVersion 必须是 import-analysis/1.0，outlineRole 必须是 observed。
- 每个原稿 block 必须且只能归入一个 chapterCandidates.sourceRanges 或 excludedRanges；不得遗漏、重叠或打乱全局顺序。
- 优先保留原稿明确章节/话/幕边界；只有没有可靠源边界时，才可按完整的目标、冲突、转折或场景序列结束提出生产章节边界。
- boundaryEvidence.start/end 的 anchorBlockRef 必须位于该候选范围内。
- 无法确定文件顺序、正文范围或章节边界时，写入 unresolvedItems；impact 使用 source_scope/source_order/boundary，系统会阻止确认，不要猜测。
- 标题来自原稿时 basis=source；否则只能给保守建议并写 basis=suggested。
- observedOutline 只能做观察性摘要，不得伪造作者意图。
- chapterCandidates.order 和 plotStages.order 必须从 1 连续递增。
- sourceRanges 只使用提供的 sourceRef/blockRef。
- excludedRanges 的每一项只允许使用单数 sourceRange；禁止写成 sourceRanges。没有排除内容时必须输出空数组，不得为了套示例排除正文。
- excludedRanges[].category 只能是 front_matter、table_of_contents、character_list、author_note、duplicate、non_story 之一。

必须输出以下精确顶层字段：
{{ANALYSIS_EXAMPLE_JSON}}

excludedRanges 条目精确结构（仅在原稿确有非正文排除内容时使用；否则保持空数组）：
{{EXCLUDED_RANGE_EXAMPLE_JSON}}

原稿版本摘要：{{SOURCE_DIGEST}}
输入模式：{{INPUT_MODE}}

原稿文件：
{{DOCUMENTS_JSON}}

{{SOURCE_BLOCKS_LABEL}}
{{SOURCE_BLOCKS_JSON}}

相邻分段的严格分析结果（需要合并时使用；不得把分段边界误当章节边界）：
{{SEGMENT_ANALYSES_JSON}}

用户本轮要求或边界反馈：
{{USER_REQUEST}}

上一版分析候选（仅在用户要求调整边界时参考；本轮仍必须输出完整新候选）：
{{PREVIOUS_ANALYSIS_JSON}}
