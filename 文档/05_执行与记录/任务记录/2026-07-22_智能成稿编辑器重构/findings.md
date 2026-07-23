---
doc_id: AIR-TASK-20260722-SMART-LAYOUT-FINDINGS
status: active
created: 2026-07-22
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 代码库探索、正式文档与用户讨论
---

# 发现与决策

## 1. 需求理解

- 用户认为现有“排版导出”难用，要求第一次进入就自动形成完整漫画成稿。
- 自动范围明确包含排版、布局、图片裁切、对白、气泡、旁白和阅读顺序。
- 用户同时要求保留真正编辑器；智能成稿与人工编辑必须一起设计，不能把编辑器降为隐藏高级功能。
- 目标是普通章节大部分内容无需手调，编辑器主要修正少量例外。

## 2. 代码事实

| 路径 | 结论 |
| --- | --- |
| `packages/shared/src/layout/document.ts` | V1 已有 page/strip、PanelFrame、PanelImage、FreeImage、Text、Balloon、crop、tail 和 reading order |
| `packages/shared/src/layout/batch.ts` | 当前自动布局页漫固定 4 镜分组，条漫固定 1 镜分组，只按数量套模板 |
| `packages/shared/src/layout/commands.ts` | 已有正式命令、批量、Undo inverse、模板和来源替换，但没有 command actor 或字段级人工保护 |
| `packages/shared/src/layout/pending.ts` | PendingEditorCommandSet 已能绑定 WC/digest、预览、应用与过期，可复用局部智能结果 |
| `apps/server/src/projects/layout-working-copy.service.ts` | 服务端初始化已从 current lock sources 创建 WC，但不会读取分镜语义、对白或生成气泡 |
| `apps/web/src/components/workbench/LayoutExportWorkspace.vue` | 当前大组件同时承载完整编辑、保存、版本、来源、出版、历史和 AI 示例，认知负担高 |
| `apps/web/src/composables/layout-editor-session.ts` | 已有加载、初始化、autosave、冲突恢复和历史会话，可保留为低层编辑 session |
| Prisma `LayoutWorkingCopy/LayoutRevision` | 已有 `schemaVersion + documentJson`，V2 文档本身无需新表；应用幂等另需窄凭证，见 ADR-0020 |
| `LayoutPendingCommandService` | 当前 pending command 复用 `PendingDialogueArtifact`，可继续承载待应用 smart batch |
| renderer/publication services | 已有确定性 PNG/PDF/条漫切片和不可变 publication，不应重写 |

## 3. 分镜可用语义

正式 Storyboard 已包含：

- `sceneId/beatId`：场景与剧情分组。
- `shotType/cameraAngle`：景别和机位。
- `comic.panelRhythm`：slow/normal/fast/impact/transition。
- `motion.frameType`：atmosphere/dialogue/action/reaction/detail/transition。
- `motion.voiceLines[]`：人物 ID、名字、原台词和 voiceStyle。
- `comic.dialogue`：兼容对白文本。
- `comic.caption`：旁白。

因此首版不需要用户重新录入对白，也不应把对话内容交给成稿模型重新创作。

## 4. 现有缺口

| 缺口 | 影响 |
| --- | --- |
| 固定分组和模板 | 不反映剧情节奏，条漫被切成重复大块，页漫缺少翻页和重点设计 |
| 不自动创建气泡/旁白 | 用户从空白开始补文字，智能成稿不成立 |
| 无视觉安全区 | 裁切和气泡可能遮挡人物与关键动作 |
| 无字段级 protection | 局部重排要么覆盖手调，要么只能粗暴锁死整个对象 |
| 无质量评分和覆盖账本 | “生成成功”不能证明没有漏镜头、漏对白、溢出或错序 |
| 页面职责过多 | 普通用户需要理解 Working Copy、Revision 和 publication |

## 5. 市场调研结论

- Clip Studio 的画格是裁切容器，气泡/文字是独立对象，Webtoon 提供连续阅读与切片视图。
- MediBang 强调画格分割、留白和气泡阅读顺序服务可读性。
- Comic Life 把脚本文字直接拖入气泡/标题，说明“脚本到成稿文字对象”应是一条连续链路。
- Anifusion 把漫画 workspace 与单图生成分开，先形成布局再编辑页面和对白。
- AI漫游应吸收模板起稿、结构化对象、脚本文字进气泡、阅读预览；不吸收完整绘画工具。

## 6. 技术决策

| 决策 | 依据 |
| --- | --- |
| 新增 `LayoutDocumentV2.automation` | 人工保护和规划来源必须随 WC/Revision 持久化、恢复和回退 |
| V2 不新增可见元素类型 | 复用现有 renderer，并提供 V2→V1 无损降级 |
| 新增 `layout_compose` 持久任务 | 视觉分析和多候选规划可能耗时，需要重启恢复、幂等和来源密封 |
| 任务只输出计划，apply 独立事务 | 防止迟到或过期结果直接覆盖当前 WC |
| 初次自动应用，后续 pending preview | 首次无用户内容；后续必须保护人工劳动 |
| 模型只输出严格视觉区域 | 任意像素坐标不可稳定复现和回归 |
| 规则 fallback 必须完整 | Provider 不可用不能让用户无法打开成稿编辑器 |
| 对白覆盖账本是硬门 | 文本遗漏或改写比版面不够漂亮更严重 |
| dialogue item 与气泡 binding 随 V2 持久化 | 仅把映射留在任务报告中，后续编辑/重排会丢失来源；人工删除还会被智能功能错误补回 |
| V1 Working Copy 升级默认保护既有对象 | 历史对象是否人工调整无法证明，安全优先于自动重排幅度；用户可显式释放保护并预览 |

## 7. 风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| voiceStyle 不能完整表达气泡类型 | thought/shout 推断偶有偏差 | 首版保守映射并允许一键改类型；真实语料后再决定是否升级上游 lineKind |
| 视觉 Provider 能力未固定 | 成本、速度和质量不确定 | M0 固定语料，M3 shadow 比较；保留 rule fallback，不在文档锁死具体供应商 |
| `LayoutExportWorkspace.vue` 继续膨胀 | 新功能难维护 | 新工作台做页面编排，现有 editor session 只做低层编辑 |
| protection 颗粒度不当 | 智能无效或覆盖手调 | 使用字段 scope，不将一次修改自动升级为整个元素 locked |
| 文档中部分旧 G5 状态文字过期 | 开发误读 | 新方案显式写优先级，并在旧 G5 主方案添加 supersession 注记 |

## 8. 当前结论

开发不需要重做数据库或正式渲染器。主工作量集中在 Shared 智能规划内核、持久 `layout_compose`、V2 人工保护和前端统一工作台。代码实施从固定语料 M0 开始，不能直接先改页面。

## 9. M0 固定基线发现

- 新 corpus 位于 `tests/fixtures/smart-layout/`，严格对应验收中的 10 个样例组；`FIX-X01/FIX-X02` 各拆条漫和页漫变体，因此共有 12 个可运行 fixture。
- Corpus 共 69 个 active Shot、59 条对白/旁白来源项，条漫与页漫各 6 个变体；每个 fixture 都有 StoryboardV2、current CandidateLockSet、ready 实尺寸图片、受控中文字体和 source digest。
- 测量图以白框固定主体/关键区域，生产 renderer 的中心 cover 能被可重复地判断为保留或截断；该语料用于几何回归，不冒充真实美术质量。
- 当前 V1 基线通过生产 Chromium renderer 生成真实 page PNG/PDF/strip slice/long PNG。视觉复核确认：页漫固定 4 镜及尾页异常放大、条漫一镜一大段、横图主体被窄框切断、所有对白/旁白缺失。
- 当前聚合结果为画格/裁切直接可用 5/69、必需气泡直接可用 0/59；需改布局 52、需改裁切 41、需创建文字/气泡 59，最少 152 个对象级调整。
- `m0-human-review-template.csv` 冻结 69 个 panel 行和 59 个 required_balloon 行。未来 ≥80% 门必须由两次独立人工复核关闭；M0 的 Codex 视觉复核只确认现状红灯，不替代该门。

## 10. M1 V2 与保护合同发现

- 现有 V1 可见对象足以承载首版智能成稿；V2 只需增加根级 `automation`，renderer 无需识别新元素或新 schema。
- V2 strict codec 先把可见字段投影到 V1 codec，再校验 binding/protection；因此既有数值、颜色、RichText、来源和几何安全门没有复制分叉。
- protection 必须按 target 类型限制适用 scope。panel image 独立承载 `crop/source/existence`，避免用户只调 crop 却把整个 panel frame 锁死。
- V1 Working Copy 无法区分历史自动内容和人工内容，升级时只能为所有既有对象写 `explicit_preserve`；这是有意的安全偏置，不代表新智能成稿文档默认全锁。
- 绑定气泡的隐藏/删除不能复用通用命令；`balloon.suppress_bound/restore_bound` 必须同时改变 element 与 binding，并用全文档 V2 snapshot 作为 inverse。
- 用户删除无绑定对象时必须清理已不存在的 protection；smart 删除则先检查全部适用 scope，不能通过删除对象绕开人工保护。
- fixture 内嵌的历史简化 `expected.renderPlan` 不等于当前生产 builder 的完整 render plan。M1 golden 使用“当前 V1 plan 与 V2 临时投影 plan 完全相等”，并另跑真实 G5 renderer gate，未改写旧 fixture 摘要。
- M1 是纯 Shared/兼容基础：Server 当前仍只正式持久化 V1，不能把 Shared codec 完成误写成 V2 Working Copy 已上线。

## 11. M2 规则智能成稿发现

- dialogue item 身份必须来自 `shotId + source + sourceIndex + sourceTextDigest`，不能使用归一化后显示文字做唯一键；这样精确来源和重复台词都可稳定追溯。
- `motion.voiceLines` 是主来源；只有精确等价的 legacy `comic.dialogue` 才去重。非角色标签如“门外声音：”仍可精确去重，但不能因此猜成某个角色或错误删除前缀。
- 只移除与当前角色精确匹配的行首前缀；说话人不明、非空 `无/none/null`、emoji/符号内容均保留并报告，标点-only 才作为空内容拒绝。
- NarrativeGroup 可在不重排 Shot 的前提下同时表达 scene/beat、连续对白交换、transition 和 impact 原子边界；规则模式以此生成确定性分页/分段，而不是重新套固定镜头数量模板。
- M2 的页漫以原子组分页，条漫以可变高度 section 编排；长对白通过降低同页容量或增高段落承载，不允许把字号降到下限以下或截断文字。
- 自动成稿的 strip section 边界必须是整逻辑像素。现有 renderer 会分别量化切片高度与长图总高，小数边界可能造成 1px 拼接差异；这是规则规划输出不变量，不应靠放宽 renderer 校验掩盖。
- 无视觉分析时，中心 crop、保守上缘气泡和关闭尾巴能保证内容完整，却不能保证视觉直接可用。M2 真实接触表已暴露边缘主体被裁、椭圆气泡曲线安全区不足、气泡遮挡和节奏留白偏保守等 M3 输入。
- renderer 当前的绝对 RichText 布局不能仅凭矩形 transform 证明椭圆内部安全；M3 必须加入 shape-safe text bounds，并决定由规划器收窄文字区还是同步校准 renderer 的 padding/verticalAlign 语义，需有 golden 回归。

## 12. M3 视觉成稿发现

- 视觉分析必须同时绑定 `assetId + assetDigest` 并重新计算 `analysisDigest`；只校验 JSON 形状会让换图后的旧人物框被静默复用。
- 视觉 Provider 失败、非法输出和低置信度是三种不同状态：非法/超时可逐 Shot 回退，低置信度主体不得生成尾巴；内容覆盖不能因 Provider 故障丢失。
- “对象都在画布内”不足以证明页漫可用。首轮 31 格被分成 29 页仍能取得高几何分，因此评分必须包含每页格数、画格/气泡占用率、重点页例外和阅读节奏。
- crop 评分与正式 renderer 必须使用相同素材实尺寸 cover 矩阵。renderer 若只平移一个 100% 大小的图片盒，会在 Shared 判断主体完整时仍输出白边。
- 气泡形状和尾巴不能由 renderer 另写近似 CSS。Shared `balloon_shape_v1` 是规划、评分、Web/Server 展示应共用的几何事实；尾巴根边需要按目标方向选择。
- 多人对白仅靠“靠近人物”仍可能让尾巴横穿另一人、另一气泡或已有尾巴。候选放置和评分均需把人物 ID、face/body、尾巴线段冲突纳入；多人 sidecar 还应按不同说话人数收窄居中，让两侧气泡保留稳定空间。
- 短对白若套用固定最大宽度，会制造本不存在的气泡/尾巴冲突；speech/shout 应按最长文本行、字号和 shape-safe 内区计算自然宽度，再受策略最大宽度约束。caption 可保持宽条语义。
- 无尾巴 caption 仅靠距离软分不足以证明来源关系；必须复用自动评分的关联口径：与来源画格大部分相交，或在 72px 内且横向/纵向对齐。
- 自动预筛可快速发现 corpus 回归，但不等于视觉签收。当前 69/69 画格、59/59 气泡是代码 rubric 结果；两次独立人工复核未完成前，不能切 feature gate 或进入 M4。
- 人工复核不能沿用裸 CSV 作为唯一入口，否则漏项、误填和把机器分当人工结论的风险过高。A/B 盲评页面必须默认未判断、隐藏自动分、按真实证据逐组展示，并隔离两轮本地进度。
- 复核结果必须 fail-closed：128 项全部完成后才可导出；失败项必须留下原因与说明；校验器拒绝来源或对象身份篡改、错误轮次、非适用字段、同一评审人关闭两轮，以及任一画格/气泡直接可用率低于 80%。浏览器自动化只验证工具合同，不能计作真人签收。
- 用户首次实际查看后无法判断页面采用了什么标准。当前 A/B 页面虽然满足数据完整性和隔离合同，但证据主要是合成几何测量图，卡片没有在图片中定位对应画格/气泡，术语也没有转成可观察的合格线或正反例，因此不能支撑非技术复核人做一致判断。
- 工程几何标准与用户质量标准必须分开：合成 corpus 继续验证零遗漏、几何、裁切、遮挡、shape-safe 和尾巴合同；真人入口必须补真实成稿观感、当前对象高亮、普通语言问题、合格/失败示例和整页阅读判断。在该入口重做前，现有 0/2 人工门保持未开始，不能要求用户填写旧表。
- 外部八段式梳理与本方案的关键分歧不是总体流程，而是规则精度：阅读方向不能按语言猜测，应使用 `panelReadingDirection`/项目 profile；气泡不必贴嘴，负空间、全局阅读路径和主体避让优先，尾巴负责建立说话归属；固定字符数不能替代受控字体的真实字形/shape-safe 测量，自动拆句也违反零静默改写与一一来源绑定。
- 可吸收的增强点：把现有 impact/focus 推导结果用普通语言显示为画格强调级；评估由上游显式标注的 `system/device` 对白类型；把通用 focal region 扩展为可解释的 face/hand/weapon/key_action/key_object 保护区域。自动创作 SFX 不应混入排版器，除非上游提供正式音效来源或用户确认建议。
- “普通读者视觉验收”不能只给字段名和工程图片。统一标准必须先定义“是否还会打开编辑器调整”，再用正反例校准，并把当前画格/气泡直接标在完整成稿上；裁切还必须能对照未裁切原图。
- 单对象通过不能代表整页可读。V2 在 128 个对象判断之外增加 30 个整页/整段判断，并提供从页首阅读、临时隐藏高亮的模式；因此每轮共 158 项。
- 视觉门应按难度和对象分桶，避免简单样例掩盖困难样例、画格高分掩盖气泡或整页低分。正式口径为普通画格/气泡/整页各 ≥90%，困难三桶各 ≥80%，且内容、裁切、阅读顺序、主体遮挡、文字可读、原文一致、说话者/尾巴等严重可见错误为 0。
- 真人结果是不可覆盖证据。复核生成器可以重建渲染产物、HTML 和空白模板，但不得覆盖已有 A/B JSON；成稿 manifest 摘要变化时旧结果必须 fail-closed，人工归档后重新评审。
- M3 现有主体/人脸/焦点/安全区已能支撑当前几何签收，但不能冒充显式手、武器、关键动作、关键物品保护；`system/device` 气泡语义和智能 SFX 也尚未完成，已在正式标准中列为后续能力边界。
- 用户复核证明，面向普通创作者的质量确认不应要求其判断“专业画格节奏”等难以观察的工程维度。产品主问题应是“这页是否能读、是否需要我改”，专业评分留给自动规则、视觉 AI 和内部抽样研究。
- 竖向条漫的主阅读路径就是从上到下；只有同一横向组合、页漫或特殊跨格结构才需要额外左右方向判断。当前复核未发现明显读序问题。
- 把气泡放在画格外是一种有效的主体避让策略，但会用更大留白换取不遮挡，不能因此宣称气泡视觉质量已好。当前已知问题从“遮挡”转为“外观、形状、间距和整体节奏”，应由编辑器与视觉 AI 局部预览闭环解决。
- M3 退出不再依赖 158 项穷举 A/B，而采用“自动硬门通过 + 用户轻量复核 + 已知风险显式接受”。A/B 仍保持空白并可用于未来真实素材研究，不能被改写成已经通过。

## 13. M4 持久任务与安全应用发现

- `GenerationTask.outputJson` 足以保存不可变成稿建议，但任务成功与建议已经应用是两个不同事实。`observedEvidenceJson` 受 legacy import 约束，不能复用；终态任务也不能在 apply 时回写。应用幂等因此需要 ADR-0020 定义的窄 `LayoutCompositionApplication`。
- 应用凭证必须和实际目标在同一事务创建，且由数据库校验 task type/status/scope 及 Working Copy/Pending 目标摘要；只靠服务层先查再写仍会留下并发双写窗口。
- initial 和 reflow 的安全边界不同：initial 可在“无 WC + 来源 current”条件下直接创建 V2 WC；任何已有 WC 的重排都只能先创建 PendingEditorCommandSet，不能直接覆盖。
- replay 不是无条件成功。凭证存在后仍需验证目标保持创建时状态；如果用户已编辑 WC、Pending 已应用/放弃或目标丢失，必须返回冲突，否则会把旧结果伪装成当前结果。
- source projection 必须冻结完整 Storyboard、current lock/Asset 摘要与尺寸、角色目录、字体/版式/策略；apply 和 worker 完成前都要重新构建 current 投影比对，任务在生成期间换图或换分镜时只能成为 historical。
- M4 当前 worker 明确传入 `analysis: null`，所以生产持久链路使用 `rule_fallback`。Shared 的视觉分析/三候选能力已存在，但真实 Provider 接线、超时注入和按 Shot 混合证据尚未完成，不能把按钮命名为“视觉 AI 已分析画面”。
- `full_reflow` 已具备完整预览与应用链路；`scoped_reflow` 在 M6 定义场景/页面/段落/选区边界前主动失败，避免用空作用域承诺冒充局部智能。

## 14. M5 统一工作台发现

- 首次成稿和后续编辑不能是两套页面。无 Working Copy 时由工作台自动发起 initial composition；应用成功后立即加载同一套正式画布、对象选择、属性、Undo/Redo 和 autosave。有 Working Copy 时直接恢复，不能因再次进入或刷新重复生成。
- 现有编辑器大量代码仍读取 V1 可见结构，因此 M5 采用“V2 是唯一保存事实，V1 只是界面投影”的兼容方式。所有旧编辑命令都以 `actor=user` 回写 V2 reducer，使手动新增、移动、改文和改样式继续生成 protection；不能把投影后的 V1 反向覆盖 V2 automation/dialogue binding。
- 对已绑定对白气泡的通用删除、隐藏和恢复，编辑会话必须转成 `balloon.suppress_bound` / `balloon.restore_bound` 语义命令，保留 `user_suppressed` tombstone；普通自定义气泡仍按旧命令处理。
- “重新排一版”如果稳定地再次选择当前最佳候选，虽然技术上成功，产品上等于没有结果。full reflow 因此在所有合法候选中避开当前可见摘要，再按既有质量排序选出另一版；initial composition 不受影响，仍保持完全确定性。
- 当前稿与待应用结果摘要相同时，Pending apply 必须按已应用收口但不能更新 WC。否则会触发数据库 no-op 写保护，且无意义地增加行版本。
- 新排法必须先以“当前排法 / 新排法”可视对比展示，用户只有“保留当前排法”和“使用这版新排法”两个主要决定。应用后进入编辑器的一次 Undo 历史；放弃只改变 Pending 状态，不修改 WC。
- 用户可见主步骤已统一为“漫画成稿”；内部 `layout_export`、`layout_compose`、Working Copy、Pending、digest 和 rowVersion 继续保留为协议标识，不直接暴露给普通页面。
- M5 真实浏览器使用隔离数据库和本地假图片 Provider，只证明任务、页面、保存、恢复和保护闭环，不证明真实视觉 Provider 已接通，也不证明假图片上的气泡审美已达到目标。工作台会诚实显示“根据分镜、图片尺寸和对白规则排版”。
- V2 的正式 Revision、来源替换、publication 和下载仍按计划留在 M7；M5 对 V2 显示“导出开发中”，没有把历史 V1 出版按钮错误套到新文档。

## 15. M6 视觉分析与局部智能调整发现

- Shared 视觉 composer 早已能消费 `LayoutImageAnalysisV1`，真实缺口在服务端一直传 `analysis=null`。M6 的正确做法是补严格素材 adapter，而不是推翻规则规划器或再造一个“视觉 AI 编辑器”。
- 图片生成 Provider 负责产图/改图，不等于视觉分析。视觉分析复用文本运行时的 JSON Schema 会话和受限图片附件，只输出区域事实；最终像素坐标、裁切、气泡位置和命令仍由确定性代码决定。
- Provider 配置必须冻结到任务来源，但凭据不能冻结。任务只保存 `providerId/modelId`、严格分析和摘要；key、base URL、secretRef、原始响应、绝对路径与图片字节均不进入 input/output。
- 视觉缓存的最小安全身份是 `assetId + assetDigest`。仅按 Shot ID、候选 ID 或路径复用都会在换图后误用旧主体框；损坏或旧格式历史 output 必须跳过。
- scoped reflow 不能把一个气泡孤立重排。element 选择必须扩到完整 NarrativeGroup；用户明确选择“当前场景”时先扩 scene，再扩 NarrativeGroup；页/段 canvas 保持用户看见的当前容器。扩展必须在预览里提示。
- 人工保护不应该让整个智能任务失败，也不能被忽略。每个候选变更按 `geometry/crop/style/tail` 单独检查，受保护字段跳过，其他安全字段继续形成预览；当没有任何安全变化时明确返回“已是最佳安全结果/全部受保护”。
- 局部重排首版故意不改 text/source/reading_order，也不增删对象。对白完整性和用户来源决定的风险高于自动美化收益；当前最需要的是位置、裁切、气泡外观和尾巴。
- `locked=true` 与 protection 是两种不同意图：锁定是全部智能字段禁止；protection 是手调字段默认保留。页面的“允许智能再次调整”只清除选中对象现有 protection，不应偷解除锁定。
- 高权重 focal region 必须与人物框共同参与裁切和气泡避让。否则画面里有人时，手、武器、关键动作和关键物体仍可能因为旧逻辑只看人物而被裁掉或压住。
- 假 Provider 浏览器测试只能证明附件、状态机、scope、Pending、Undo 和保护闭环，不能证明真实视觉模型审美。M6 可关闭工程接线与安全门，但具体模型质量必须在未来预算授权下单独抽样，且规则 fallback 始终保留。
