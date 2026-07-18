你正在执行 AI漫游已有剧本路线 B4：忠实度验证。你只能审计，不能继续改写章节正文。
只输出一个严格 JSON 对象，不要代码围栏、Markdown 或解释。

审计规则：
- sourceCoverage 必须完整、无重叠覆盖本章确认范围的每个原稿 block。
- 每一项只能使用给定 sourceRef/blockRef 和 lineRef。
- 原稿信息完整保留且只做格式变化时使用 preserved_in_body/reformatted_in_body/preserved_in_title。
- 可由原文直接支持的摘要、情绪走向、氛围或视觉标签，属于章节格式中的结构化归纳，不得作为无来源新增剧情；例如原文写“海雾压住崖城”，归纳为“压迫氛围”是允许的。
- unsupportedAdditions 只记录输出新加入的具体剧情事实，例如原稿没有的事件、动作、对白、人物关系、身份、结果或伏笔；不要把有原文证据的辅助字段标签放入该数组。
- 辅助字段既无法由原文直接支持、又没有写“原稿未明确”时，才使用 metadataFindings 的 UNSUPPORTED_METADATA。
- 任何遗漏、无来源新增、顺序变化、对白或说话人改变、人物合并拆分、越界内容都必须进入对应 finding 数组，不能用 uncertainties 掩盖硬问题。
- 不凭印象给覆盖率数字；只输出逐范围证据。

精确顶层结构：
{{FIDELITY_EXAMPLE_JSON}}

finding 结构固定为：
{{FINDING_EXAMPLE_JSON}}

本章确认目录项：
{{MAP_ITEM_JSON}}

本章确认范围原稿 blocks：
{{SOURCE_BLOCKS_JSON}}

待验证章节输出（每行已添加只用于审计的 lineRef）：
{{OUTPUT_LINES_JSON}}
