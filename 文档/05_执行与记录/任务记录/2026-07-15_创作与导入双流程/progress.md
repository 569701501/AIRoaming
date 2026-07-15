# 进度日志

---
doc_id: AIR-TASK-20260715-DUAL-SCRIPT-FLOW-PROGRESS
status: in_progress
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 会话：2026-07-15

### 阶段 1：事实源恢复

- **状态：** completed
- 已读取项目入口、AI 上下文、写作规则、核心用户流程、剧本对话方案、外部创作 Skill 调研和会话记忆。
- 确认当前剧本页右侧只承担章节正文展示与编辑，剧情结构页已有完整的摘要、方向、角色、场景、节拍和备注字段。
- 确认产品已有“AI 创作 / 用户提供剧本整理”双来源口径，两路下游均按章节推进。

### 阶段 2：双流程与确认门冻结

- **状态：** completed
- 用户确认采用 A+ 简化方案，并要求先确定两条流程，再逐阶段完善细节并串联。
- 用户明确要求前面的中间产出暂不影响现有页面展示字段。
- 用户确认拆章目录只需整体确认一次；确认后一次创建全部待确认章节草稿。用户可自由切换章节查看，不要求顺序检查；只有点击某章“确认章节”，该章才落入正式章节剧本，未确认章节继续保持草稿。
- 用户进一步收窄 V1：待确认章节草稿只允许查看和确认，不提供手动修改，也不提供 AI 重新整理；不满意时保持待确认，修改能力不进入本轮。
- 两条上游路线、页面不变边界和导入草稿确认门已冻结。

### 阶段 3：AI 创作逐阶段契约

- **状态：** completed
- 用户要求开始逐阶段确定 AI 创作路线。
- A1“创作入口意图与分流”已获用户确认：系统自动判断找灵感/明确题材，明确题材直接进入大纲，只有无法判断路线时才提问；A1 无单独表单和确认门。
- A2“灵感候选与选择”已获用户确认：固定 3 个、页面展示不变、P1 内部评测、选择/换一批/改用明确题材，V1 不做单候选编辑与合并。
- A3“项目大纲与章节安排”已获用户确认：现有 Markdown 增加轻量章节安排，通过对话生成/修改/确认，不新增页面字段或正式 ChapterPlan。
- A4“单章待确认草稿生成”已获用户确认：默认只生成当前目标章，批量不作为主流程；草稿只进入 pending，不覆盖正式正文。
- A5“采用、正式化与进入剧情结构”已获用户确认：完整只读查看；采用进入当前正文；完成本章才发布正式版本并允许 StoryStructure；丢弃不自动重生成。
- 用户再次修正章节推进交互：删除“继续下一章”；只有已确认大纲存在下一章卡时才增加入口，页面仍停留当前章。切换下一章只加载该章及其对话上下文，不触发 A4；用户在当前章对话框明确输入“生成当前章节”后，A4 才读取当前章章节卡和上一章已确认正文生成 pending。
- 已串联 A1～A5 并执行静态一致性复核，AI 创作路线可以转入已有剧本分析路线 B1。

### 阶段 4：已有剧本分析/整理逐阶段契约

- **状态：** completed
- 已核对当前入口：剧本页对话框支持 `.txt/.md` 文本附件和长文本粘贴；附件选择本身不应写入项目。
- 已核对当前 `script-import-normalize`：已有内容类型、章节边界和覆盖风险判断，但当前设计仍可能在分析通过后直接写入章节，不符合新的 B1～B5 分段流程。
- 已形成 B1 草案：保存不改写的内部原稿副本，检查可读性、内容类型、多文件顺序、用户目标和既有章节冲突；无阻断问题时直接进入 B2，不创建章节或章节草稿。
- 用户回复“继续”，确认 B1。当前进入 B2“原稿分析大纲与拆章候选”。
- 已形成 B2 待确认草案：观察性原稿大纲与带来源范围、边界证据、置信度的拆章候选合并为一个候选包；优先保留原稿显式边界，禁止按固定字数或创作公式机械切分；结果交给 B3 统一展示和确认，B2 不创建章节。
- 用户明确进入 B3，视为确认 B2。当前开始确定拆章目录的展示、修订、一次确认和 B4 触发边界。
- 已形成 B3 待确认草案：候选目录在对话结果卡中只读展示，用户可整本确认一次、通过对话反馈返回 B2 生成完整新候选，或取消导入；不提供目录表格内手动编辑。确认只批准章节数量、顺序、来源范围、排除项和建议标题，并授权 B4 创建全部 pending，不代表正文已确认。
- 用户明确进入 B4，视为确认 B3。当前开始确定确认目录后怎样建立全部章节入口、忠实生成每章 pending、处理批量失败并移交 B5。
- 已形成并确认 B4：B3 确认后先按 confirmed chapter map 建立全部稳定章节入口，再按来源范围逐章忠实整理并写入各章 pending；批量任务可内部排队，单章失败隔离；全部章节至少完成一次生成尝试后才开放 B5，不设 20 章产品上限、不写正式正文、不进入 StoryStructure。
- 用户明确进入 B5，视为确认 B4。当前开始确定用户怎样自由切换并完整查看每章导入草稿、一次确认成正式版本，以及按章进入 StoryStructure。
- 已形成 B5 待确认草案：导入 pending 在正文区域完整只读展示，用户可任意顺序查看；不提供手动编辑、AI 重新整理、采用后编辑、丢弃或批量确认。单一“确认章节”动作原子发布正式 `ChapterScriptVersion`，停留当前章并解锁该章 StoryStructure，其他章节状态不阻塞。
- 用户确认 B1～B5 并要求完整串联与一致性检查。
- 已完成静态复核并修正四处冲突：AI 路线“采用草稿”和导入“确认章节”分名；AI 后章要求前章正式且只在存在下一章卡时增加入口；B4 复用空白默认第 1 章；B4 等全部章节至少完成一次生成尝试后才进入 B5。
- 复核结论为 `pass_for_prompt_and_implementation_design`：两路在正式 `ChapterScriptVersion`、StoryStructure 门禁和现有下游字段汇合；当前运行时仍有 9 类实施差距，尚未修改代码、数据库或生产 Prompt。

## Handoff

### 完成

- A+ 方案边界已确认。
- 页面字段不变已确认为本任务约束。
- AI 创作 A1～A5 与已有剧本 B1～B5 已逐阶段确认并完整串联。
- 静态一致性复核通过，正式产品口径已同步。

### 未完成

- 阶段到现有五个 Skill、P1～P6、Prompt Contract 与固定评测的映射尚未完成。
- 生产 Prompt、代码、数据库和页面实现尚未修改；当前运行态仍有已记录的 9 类实施差距。

### 证据

- `文档/01_愿景与产品/核心用户流程.md`
- `文档/04_方案与决策/2026-05-27_剧本对话功能再设计方案.md`
- `文档/04_方案与决策/2026-07-15_外部创作Skill提示词调研与适配判断.md`

### 流程遵守

- 本轮仅修改产品、方案、任务与记忆文档。
- 未修改代码、数据库、生产 Skill 或页面字段。

### 阶段 5：Skill / Prompt 蓝图

- **状态：** completed
- 已完整读取 `$deep-think`、`$skill-creator`、五个现有剧本 Skill、剧本 Agent、运行时动态 Prompt、共享 Markdown/JSON 格式、DTO、Prisma pending/outline 结构和当前导入分析逻辑。
- 已确认生产模型主要执行 `dialogue-prompt.util.ts` 动态 Prompt，仅修改 `SKILL.md` 不会生效；共享格式、动态 Prompt、Agent、Skill 与测试必须分层治理。
- 已形成十阶段到五个 Skill 的映射：A1/B1/B3/B5 及 A5 的确认动作属于编排；B2/B4 复用 `script-import-normalize` 的 `analyze/materialize/verify` 模式；不新增孤立公开 Skill。
- 已安排 P1～P6、三层输出边界和 P6 路线差异评测；下一步逐阶段冻结生产 Prompt Contract。
- 已对映射做静态复核：未出现多 Skill 争夺一个阶段、用户确认被 AI 化、P1～P5 污染忠实导入、最终章节格式分叉或孤立 Skill；结论为 `pass_for_prompt_contract_detailing`。
- 已形成共享 Prompt Contract：阶段调用统一声明触发、前置条件、权威/参考/缺失上下文、唯一目标、方法、输出、禁止项、在线校验、P6、修复和用户门；Markdown/JSON 保持原格式，不增加统一外壳。
- 已形成 A2 Prompt Contract 初稿：只输入用户描述和项目基础约束，不注入当前章节/大纲；保留现有六字段与三张卡；P1 检查反差、主角压力、持续冲突、情绪钩子、视觉承诺、结局潜力及三候选差异；线上严格要求恰好 3 个，格式只修复一次；P6 主要使用固定正反触发和质量回归，不默认每次在线增加第二模型调用。
- 用户回复“继续”，视为确认 A2 并进入 A3。已核对当前大纲 Skill、动态 Prompt、共享 Markdown 格式、保存 DTO 和对话确认按钮：现状只有三个大纲区块，`剧集章数` 是自由文本，A4 无法读取稳定目标章节卡。
- 已形成 A3 Prompt Contract 初稿：保留现有三个区块并增加 `四、章节安排`；`剧集章数` 固定为明确正整数，每章只有标题、章节目标、核心冲突、关键转折、结尾钩子和下一章衔接；P2 检查人物推动力、触发事件、因果链、冲突升级、承诺兑现和明确结局，但不强制三幕式。
- A3 支持选中种子、明确题材和确认前完整修订三种模式；每次修订返回完整替换版 Markdown。用户仍在现有对话结果中整体预览、修改或一次确认；不新增页面字段、正式 ChapterPlan、章节正文、章节批量草稿或 StoryStructure。
- 已列出 A3 在线校验、P6 正反样例及 6 项当前实现差距；静态复核确认轻量章节卡未复制 StoryStructure 的角色、场景和 beats。当前等待用户确认后进入 A4 Prompt Contract。
- 用户回复“继续”，视为确认 A3 并进入 A4。已核对当前`script-chapter-drafting`、动态 Prompt、目标章节解析、固定章节格式、`ChapterScriptPending`与 pending 写入：现状只传整份大纲和目标标题，没有目标章节卡、前章正式正文、P3/P5 或完整前置门禁。
- 已形成 A4 Prompt Contract 初稿：只有 A3 确认生成首章，或用户切换到后续当前章后明确输入“生成当前章节”才能触发；切章、增加下拉入口和“继续下一章”均不触发。第 N 章要求第 N-1 章正式，当前章必须有唯一章节卡、无正式正文且无 active pending。
- A4 上下文包固定为项目确认事实、大纲项目级区块、当前和相邻章节卡、前章正式正文及用户有效补充；操作命令不作为剧情输入。已定义事实冲突优先级、P3 八项场景契约、P5 时间/知识/伤势/道具/关系/伏笔连续性，以及只基于真实注入上下文检查的边界。
- 输出继续使用现有六区块章节 Markdown；章节方向和结尾块总结实际草稿，不机械复制计划卡。服务端需绑定大纲、章节卡和前章正式版本来源，A4 只原子写一个 AI pending，不改 Working Copy/正式版本、不生成 StoryStructure。
- 已补齐在线硬校验、P6 正反样例和 8 项实现差距；静态复核确认 A4 没有取得切章、采用、完成或下游权限。当前等待用户确认后进入 A5 Prompt Contract。
- 用户回复“继续”，视为确认 A4 并进入 A5。已核对当前`script-chapter-editing`、AI 改写路由、Script Working Copy、AI pending adopt/discard、publish、Web 编辑器和完成后动作：DB 已有 CAS 与 active pending 保护，但完整 pending 只展示约 200 字，AI 改写缺 baseWorkingDigest/P4/P5，publish 固定 origin=user 且无大纲下一章卡门禁。
- 已将 A5 拆为四段：完整查看 pending、确定性采用/丢弃、可选 AI 分层修订、确定性保存/完成。只有 AI 修订调用`script-chapter-editing`；所有状态和正式版本动作均不调用模型。
- 已形成 A5.3 Prompt Contract：用户必须先采用、Working Copy 非空且已保存、无 active pending；P4 固定`continuity_logic / structure_character / scene_dialogue / prose_format`四层，只改指定范围并运行 P5 防回归；模型返回完整 Markdown，结果继续成为 revision pending，不直写正文。
- 已冻结完成本章门禁：Working Copy 非空、已保存、无 pending、digest/rowVersion 当前、固定格式合法；发布不可变 ScriptVersion 后停留当前章，只在确认大纲存在下一章卡时增加对应入口，不显示“继续下一章”，StoryStructure 精确绑定正式版本。
- 已定义 AI/人工最后实质修改来源、重复完成幂等、正式改版使旧 StoryStructure stale，以及 10 项当前实现差距。静态复核确认 import pending 不进入 A5 编辑链，AI 路线保留现有 Working Copy 手动编辑。当前等待用户确认后进入 B2 Prompt Contract。
- 用户回复“继续”，视为确认 A5 并进入 B2。已核对当前`script-import-normalize`、`ScriptImportAnalysis`、导入启发式规则、附件拼接、对话编排和分析结果卡：现状只识别内容类型与标题/编号边界，缺少不可变原稿块、观察性大纲、SourceRange、边界证据、覆盖计算和长稿分析；`ready_to_import`还会同轮直接写章。
- 已形成 B2 Prompt Contract 初稿：模型只输出`outlineRole=observed`的严格 JSON 候选包；原稿由服务端预切成稳定`sourceRef/blockRef`，模型只引用来源块，不生成数据库 ID。候选章必须保持全局连续、无重叠/遗漏，并提供开始和结束边界证据；覆盖由后端范围并集计算，不接受模型自报“98%”。
- 已冻结长稿不能首尾截断：小稿单次分析，长稿仍由同一个 Skill 的 analyze 模式内部执行`scan_window → compose_global → review_boundaries → finalize_candidate`，任何窗口或中段事件缺失均不得进入 B3。P1～P5、固定章数、黄金钩子和三幕式不进入忠实导入。
- 已补齐 B3 反馈全量替换、阻断/非阻断、在线 Validator、一次格式修复、20 项 P6 正反回归和 11 项当前实现差距。B2 只保存分析候选，不创建章节、不写 pending、不返回 nextTool；当前等待用户确认后进入 B4 materialize/verify Prompt Contract。
- 用户回复“继续”，视为确认 B2 并进入 B4。已核对当前`importScriptToChapters()`、AI 大纲批量生成、固定章节 formatter/parser、DB `ChapterScriptPending`和 operation DTO：现状导入可直接替换章节正文；AI 批量逻辑边生成边建章、失败即停止；pending 缺少 raw source/map/range/verify 来源绑定。
- 已形成 B4 双 Prompt Contract：后端先按 confirmed chapter map 原子创建全部章节入口；每个章节独立执行`import.materialize`输出现有六区块 Markdown，再执行`import.verify`输出独立忠实度 JSON。模型不能决定写入，只有格式门和 verify 无硬问题时后端才创建 import pending。
- 已冻结 materialize 只做格式转换：保留全部叙事信息、直接对白、说话人和事件顺序；间接引语不得改成新对白，缺少字段写“原稿未明确”，不得用黄金钩子、三幕式或固定篇幅改原稿。单章范围超预算时必须返回 B2/B3 按自然边界重拆，B4 不做首尾截断。
- 已冻结 verify 的 source block/候选 line 双向引用、完整范围覆盖、无来源新增、顺序、对白、人物和跨章污染检查；服务端不接收模型总分或 ready 自评。技术重试、格式修复和 fidelity repair 均有界，仍失败则当前章 generation_failed。
- 已形成全部章节先建入口、无 20 章限制、单章失败继续、全部章节至少尝试一次后开放 B5、幂等重放不重复建章/覆盖正式章等批次规则，并补齐 27 项 P6 样例和 15 项当前实现差距。当前等待用户确认 B4。
- 用户回复“继续”，视为确认 B4，并进入最终 Prompt 体系一致性复核。
- 最终复核修正四个边缘问题：B3 确认前新增单章完整处理预算门；B5 正式进入后移除“生成中”状态；B2 原稿总标题与建议章节标题拆分来源枚举；B4 在 materialize 规则中显式声明原稿为不可信数据。
- 已确认最终为五个公开 Skill、七个模型 stage contract；A1/B1/B3/B5、A5 确定性动作和 StoryStructure 门禁不调用模型。Skill、运行时 Prompt、Shared Schema、后端编排、P6 fixtures 和页面职责已逐层冻结。
- 已完成七项端到端不变量复核、五个实施包、10 条实施验收标准、残留风险和 Handoff；Scrutiny Review 结论为`pass_for_implementation_planning`。
- 本轮仅完成产品/Prompt 设计和文档留痕，未修改生产 Skill、动态 Prompt、代码、数据库或页面；Runtime/User Review 不适用。下一任务如获授权，应从共享输出契约与严格校验开始。
