---
doc_id: AIR-TASK-20260722-SMART-LAYOUT-PROGRESS
status: active
created: 2026-07-22
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 本任务进度
---

# 进度日志

## 会话：2026-07-22

### 产品理解与现状探索

- **状态：** complete
- 已确认现有第 6 步的真实职责、V1 自动布局限制、完整编辑器、Working Copy、Revision、publication 和来源返修能力。
- 已确认用户目标从“阅读校对为主、编辑器可选”修正为“智能成稿与正式编辑器同等重要、连续存在”。
- 已确认自动范围必须包含布局、裁切、对白、气泡、旁白和阅读顺序。

### 市场调研与方向确认

- **状态：** complete
- 已调研 Clip Studio Paint、MediBang、Comic Life 和 Anifusion 官方工作流。
- 用户已确认零配置智能成稿、同一编辑器手调、局部智能预览和简化导出方向。

### 正式开发文档

- **状态：** complete
- 已创建 ADR-0019。
- 已创建智能成稿规划与编辑保护契约。
- 已创建智能成稿与编辑器一体化开发方案。
- 已创建实施任务计划、发现、进度、Handoff 和独立验收清单。
- 已同步产品、架构、模块、索引和长期记忆（以本次最终 diff 为准）。

### M0 固定语料与现状基线

- **状态：** complete
- 新增 `tests/fixtures/smart-layout/`：10 个语义组、12 个条漫/页漫变体、69 个镜头、59 条对白/旁白来源项。
- 每个变体均冻结正式 StoryboardV2、current lock set、ready 实尺寸测量图、受控 Noto Sans SC 字体、对白账本、V1 现状文档和逐画格 rubric。
- 新增可重复 corpus 生成器、生产 renderer 基线脚本和 7 个 M0 合同/产物测试。
- 真实生成 6 份 PDF、10 张 page PNG、11 张条漫切片和 6 张长图，并生成页漫/条漫接触表。
- 当前红灯：画格/裁切直接可用 5/69（约 7.25%），必需气泡直接可用 0/59；最少需要 152 个对象级调整。
- 已逐张复核接触表；双人人工复核模板包含 69 个 panel 行和 59 个 required_balloon 行，正式未来质量签收仍为 0/2。
- M0 未修改 LayoutDocument schema、产品 UI、视觉 Provider、数据库、migration、真实用户项目或 `layout_compose`。

### M1 LayoutDocumentV2 与编辑保护

- **状态：** complete
- 新增 `packages/shared/src/layout/automation.ts`：strict `LayoutDocumentV2`、composition metadata、dialogue binding/protection 不变量、V1 WC 保守升级、V2→V1 临时投影、统一 V1/V2 读取和窄 composition digest。
- 新增 `packages/shared/src/layout/commands-v2.ts`：`user/smart/system` actor、字段级保护映射、smart 越权拒绝、显式释放保护、绑定气泡 hide/delete/restore 原子命令、批次单 inverse。
- V1 Working Copy 升级会为 canvas、顶层 element 和 panel image 按适用 scope 写入 `explicit_preserve`；历史 V1 Revision 和既有摘要没有迁移或重算。
- 用户改 crop/text/geometry/style/tail/source/reading order 会只保护对应 scope；智能命令仍可修改未保护 scope，触碰保护或 `locked=true` 时 fail-closed。
- 通用 delete/hide 不得作用于 bound balloon；语义 suppress 支持 hidden 引用或 null tombstone，restore 校验 `initialTextDigest`；复制气泡保持副本 unbound。
- 用户显式删除无绑定对象会同步清理悬空 protection；smart/system 不会借此静默释放保护。
- M1 未接 Server Working Copy/Revision 持久化、`layout_compose`、视觉 Provider、自动气泡规划或 Web，避免越过 M2/M4 停止线。

### 验证

- **状态：** complete
- 文档设计子阶段的 `git diff --check`、路径、`doc_id` 和长期记忆行数检查通过。
- 文档设计子阶段仅修改 `文档/`；随后 M0 新增测试 fixture、基线脚本、测试和 renderer 证据，但仍未修改产品运行时、Schema、migration、依赖、数据库或真实用户项目。
- 已检查状态表述：G5 编辑/出版基础为 completed，智能成稿产品范围仍为 accepted/not_implemented；仅 M0 fixture/baseline 阶段标记 complete，主体验收用例保持 `not_run`。
- 文档设计子阶段没有页面或新产物，因此当时 Runtime/User Review 不适用；M0 的实际 renderer 产物复核见下节。

### M0 验证补充

- **状态：** complete
- `pnpm smart-layout:m0:generate` 通过，corpus digest 为 `sha256:8906e9e2f3dc8c2d2c58db189225233f7ae610578cf1ef9f6cd9e9b10d6a1aef`。
- `pnpm smart-layout:m0:render` 连续复跑两次通过，生产 renderer 为 `chromium-149-layout-v1`，两次 output manifest digest 均为 `sha256:5119bea242ac1e623bce706a67b34efe13515b94ceb50899098b632a933d7fc0`。
- `pnpm test:smart-layout:m0`：7/7 passed。
- Runtime/User Review 在 M0 的适用范围是实际 renderer 产物与接触表复核，结论已记录在 `evidence/m0-baseline/m0-visual-review.md`；真实产品页面因本阶段未改 UI 而不适用。
- 下一阶段为 M1，不得跳过 V1/V2 可见等价、V1 WC 保守保护、binding/protection strict codec 和 renderer golden 回归。

### M1 验证补充

- **状态：** complete
- `pnpm test:smart-layout:m1`：15/15 passed。
- `pnpm --filter @airoaming/shared test`：29 files、182/182 passed。
- `pnpm test:render`：green；G5 fixture 3/3、Shared publication 4/4、Chromium renderer 5/5、DB publication recovery 1/1。
- `pnpm typecheck`：Shared/Server/Web 全部通过。
- 根 `pnpm test` 并行高负载下有 18 个既有备份/迁移用例触发 5 秒 timeout；两份失败文件隔离复跑 44/44 通过，判定为资源竞争而非 M1 回归，未修改 timeout 掩盖现象。
- Runtime/User Review：本阶段未改产品页面，因此页面复核不适用；实际 Chromium PNG/PDF/条漫切片和 DB publication recovery 已作为运行时兼容证据执行。
- M1 退出后按停止线进入 M2；未提前创建持久任务或改正式页面。

### M2 对白、叙事分组与规则智能初稿

- **状态：** complete
- 新增 `packages/shared/src/layout/dialogue.ts`：从 `motion.voiceLines`、legacy `comic.dialogue` 和 `comic.caption` 建立稳定 dialogue item、来源摘要、精确去重、保守类型推断、warning 与初次成稿覆盖硬门。
- 新增 `packages/shared/src/layout/narrative.ts`：按 scene/beat/dialogue exchange/transition/impact 建立确定性 NarrativeGroup，不跨场景、不乱序，保留连续对话交换。
- 新增 `packages/shared/src/layout/rule-composer.ts`：strict 来源校验、页漫原子分页、条漫可变高度段落、规则裁切、可编辑 RichText/Balloon、绑定、阅读顺序、composition metadata 和 V2→V1 可见投影。
- 页漫与条漫均把 active Shot 恰好放置一次；每条来源文字恰好生成一个绑定气泡/旁白，不创建无来源文字，不静默改写。
- 没有可靠人物视觉锚点时规则 fallback 不伪造尾巴；视觉分析不可用以 warning 留痕，完整内容仍可进入现有 renderer。
- M2 未接 Server task、数据库、正式 Working Copy 或 Web；M3 的视觉分析、候选评分和 80% 质量门仍未完成。

### M2 验证补充

- **状态：** complete
- `pnpm test:smart-layout:m2`：Shared 聚焦 15/15，真实产物合同 1/1。
- `pnpm --filter @airoaming/shared test`：32 files、197/197 passed（最终回归以本任务结束时复跑结果为准）。
- 12 个固定变体全部通过生产 `LayoutRendererService`：69/69 镜头、59/59 对白/旁白、36 个 canvas、0 矩形文字 overflow、0 静默改写。
- 真实产物包含 6 份页漫 PDF、页 PNG、6 组条漫切片和长图；manifest digest 为 `sha256:bfd9598ae2e2ec979f2ea605f9163e2dd26038c1e6f949782d6fafc54f75b804`。
- 证据入口：`evidence/m2-rule-composition/m2-rule-output.manifest.json`、两张 contact sheet 和 `m2-visual-review.md`。
- Runtime/User Review 在 M2 的适用范围是生产 renderer 产物与原尺寸样例复核，结论为 `passed_contract_visual_unscored`；长对白椭圆安全区、边缘主体裁切、尾巴定位、遮挡与节奏平衡均明确留给 M3，未宣称达到 80%。
- 下一阶段为 M3：严格视觉分析 contract、主体/人脸/文字安全区、有限候选、确定性评分/修复和双次人工质量复核。

### M3 视觉分析、多候选与生产成稿

- **状态：** complete_with_accepted_visual_risk（最终状态见后文用户轻量复核）
- 新增 `visual-analysis.ts`：strict `layout_visual_analysis_v1`、归一化矩形/点、Asset digest 绑定、canonical digest、非法/过期分析拒绝、低置信度与 Provider 不可用时的确定性规则 fallback。
- 新增 `visual-composer.ts`：基于主体/人脸/焦点/文字安全区生成 `balanced/subject_first/dialogue_first` 三套完整候选，稳定评分与 digest tie-break，改进页漫并排/sidecar/focus pair 和条漫可变高度布局。
- 新增 `composition-score.ts`：分别计算画格几何、页节奏/占用率、裁切可见率、阅读顺序、主体遮挡，以及气泡几何、类型、文字、shape-safe、尾巴人物映射/穿越冲突。
- 气泡外置候选按 canvas 限制，不再被错误夹回画格；多人长对白可放在画格上方/侧边，尾巴路径避开错误人物、相邻气泡和已有尾巴。
- Server 正式 renderer 的 cover 计算已与 Shared/Web 实尺寸矩阵对齐，并改用 Shared 受控 speech/thought/shout/caption 路径与方向尾巴，未建立第二套成稿渲染。
- M3 仍是离线 Shared/renderer shadow 验证；未创建 Server `layout_compose`、未写数据库、未修改正式 Working Copy 或产品页面。

### M3 产物与自动预筛

- **状态：** passed_automated_prescreen（人工研究状态见后文）
- 12 个变体通过生产 renderer，输出 42 个 canvas、18 张页漫 PNG、6 份 PDF、条漫切片与 6 张长图；manifest digest=`sha256:858d8d7862497001d8d8e7258ca84963909c3aef685e3665fd13b825f7edf84b`，连续生成一致。
- 内容硬门保持 69/69 镜头、59/59 对白/旁白、0 静默改写、0 文字溢出；所有 69 个高置信主体/人脸均完整保留，59/59 气泡 shape-safe 通过。
- 自动预筛：画格 69/69（100%），气泡 59/59（100%）；条漫与页漫两项均为 100%，裁切、主体避让、shape-safe 和尾巴语义也均为 100%。
- `FIX-P02` 与 `FIX-P04` 的上一版失败已通过通用规则关闭：多人 sidecar 按说话人数收窄居中，speech/shout 按文字长度自适应宽度，无尾巴 caption 必须与来源画格相交或在 72px 内对齐邻接。未删除样例或对象。
- Agent 已检查两张接触表和代表性原尺寸 PNG；详细结论见 `evidence/m3-visual-composition/m3-visual-review.md`。
- 两份人工复核 CSV 已包含全部 69 个 panel、59 个 required_balloon、来源原文、尾巴/shape-safe 字段和真实 evidence path，但保持空白。该句记录当时停止线；后续用户轻量复核明确取消其 M4 阻塞地位，M3 最终按已接受视觉风险退出。

### 2026-07-23 M3 自动质量收口

- 为 `FIX-P02` 冻结多人物页增加直接回归：5/5 画格和 7/7 气泡均直接可用，两条短对白气泡宽度均小于来源画格的 62%。
- 为 `FIX-P04` 冻结长对白页增加 caption 来源关联回归：3/3 caption 均直接可用且不含 `balloon_detached_from_source_panel`。
- Agent 复核了全部页漫/条漫接触表，并以原尺寸复核 `FIX-P02 page 1`、`FIX-P04 page 2/3`、`FIX-V02/V03` 复杂条漫；未发现新的遮挡、错指、文字溢出、白边或切片断裂。
- 回归通过：M0 7/7、M1 15/15、M2 15/15 + 产物合同、M3 12/12 + 产物合同、Shared 34 files/210 tests、Server renderer 5/5、全仓 typecheck 和 publication render gate。
- 文档与证据自检通过：1476 个 doc_id 全部唯一，长期记忆 286 行，M3 文本证据不含本机绝对路径或密钥，两份人工评分表的评审字段仍全部空白。

### 2026-07-23 M3 人工盲评工具

- 生成 `m3-human-review-round-a.html` 与 `m3-human-review-round-b.html`：24 个证据组覆盖 69 个 panel 和 59 个 required_balloon；页面默认 0/128，不展示机器结论，A/B 进度隔离。
- 每项可选择“直接可用”或“需要调整”；失败项必须选择原因并填写说明。只有 128 项完成、填写评审人且确认独立评审后才能导出同名 CSV。
- 新增 fail-closed 校验：严格核对 CSV header、来源原文、evidence path、对象身份、轮次、适用字段、布尔值、调整说明和 80% 门；同一评审人不能关闭 A/B 两轮。
- 真实 Chromium 回归验证 24 组、128 项、导出 129 行、A/B 隔离且无控制台错误；M3 当前为 Vitest 12/12、Node 产物/页面/校验合同 7/7。
- 当前 `pnpm smart-layout:m3:review:validate` 正确返回 `pending`：A/B 均为 0/128。该非零结果是尚待两位真实复核人的预期停止状态，不是自动成稿回归失败。
- 最终复跑通过：M0 7/7、M1 15/15、M2 15/15 + 产物合同、M3 12/12 + Node 7/7、Shared 34 files/210 tests、全仓 typecheck、G5 fixture 3/3、publication 4/4、Server renderer 5/5 与 DB publication recovery 1/1；正式 render gate 为 `green`。

### 2026-07-23 M3 普通读者视觉标准与真实图复核 V2

- **状态：** implemented_review_pending
- 用户实际查看旧版盲评页后无法识别采用了什么标准；旧页面因此降级为工程几何证据，不再用于真人签收。
- 新增正式标准 `AIR-QA-COMIC-FINAL-001-v1`：定义“可以直接用”、严重可见错误、阅读方向、气泡位置、文字拆分、自动校验与真人复核边界。普通样例画格/气泡/整页三桶分别要求 ≥90%，困难样例分别要求 ≥80%，严重可见错误必须为 0。
- 新版证据复用项目既有 11 张真实雨夜仓库漫画图，经正式视觉 composer 和生产 renderer 生成 12 变体、30 个完整页/段，覆盖 69 个画格和 59 个气泡；manifest digest=`sha256:d602087ee3a33aaaa90be4976a5bef996b32f7b370873e2a1dff5b909dc84ddf`。
- 新版 A/B 页面先展示真实正反例和普通语言判定线；复核时显示完整成稿、黄色当前对象框、镜头说明、说话者、中文气泡类型、原文和未裁切原图；整页判断可从页首阅读并暂时隐藏黄色框。
- 每轮新增 30 个整页/段判断，总计 158 项；没有批量通过按钮。选择“我会调整”必须选原因并写说明，只有全部完成、填写评审人并确认独立性后才能导出 JSON。
- 新版 fail-closed 校验绑定标准编号、manifest 摘要、真实源图、对象/页身份、适用失败原因、严重错误标记、完成时间和 A/B 不同评审人。状态明确区分 `pending/invalid/critical_failure/below_threshold/passed`。
- 生成器始终覆盖空白模板，但只在结果文件不存在时创建结果文件，避免复跑证据生成时覆盖真人结果；manifest 变化会使旧结果失效。
- V2 校验合同测试 6/6、真实文件摘要测试 1/1、Chromium 交互/导出/A-B 隔离测试 1/1 通过；当前新版校验正确返回 `pending`，A/B 均为 0/158，因此 M3 仍未关闭且不进入 M4。

### 2026-07-23 用户轻量复核与 M3 退出决策

- **状态：** complete_with_accepted_visual_risk
- 用户实际查看成稿后确认：当前没有明显主体遮挡；竖向条漫按从上到下阅读，没有发现明显读序问题；气泡放在画格外能避免遮挡，但部分气泡外观较丑或形状不自然。
- 用户无法从重复草图可靠判断专业画格大小、节奏和关键动作完整度，认为继续完成 158 项人工表价值不足，并明确授权先继续正式开发。
- 产品兜底确定为：自动先生成完整结构化成稿；用户可直接手调；不满意时由视觉 AI 生成局部布局预览，用户可应用或放弃。气泡美观和专业节奏作为后续真实素材与编辑器路径中的已知问题，不伪装为已解决。
- A/B 结果继续保持真实 `pending 0/158`，工具与标准保留为内部研究，不再作为 M4 阻塞门。M3 退出状态改为 `complete_with_accepted_visual_risk`，现在进入 M4 持久任务与安全 apply。

### 2026-07-23 M4 持久成稿任务与安全应用

- **状态：** complete
- Shared 新增 `layout_compose` 章节任务、initial/full/scoped mode、意图/作用域、来源冻结、输出报告、应用响应和敏感内容扫描合同；`LayoutWorkingCopy` 与 Pending command 支持 V1/V2，V2 不允许降级保存回 V1。
- migration `0018_layout_document_v2_working_copy` 保留 legacy/V1 行，允许带 CAS 的 V1→V2 单向升级，并增加不可变 `LayoutCompositionApplication` 应用凭证。该窄关系模型用于 exactly-once apply，正式决策见 ADR-0020。
- Server 新增权威来源投影：只读取 current confirmed Storyboard、完整 current CandidateLockRevision/ready Asset/实尺寸/摘要、角色目录、受控字体与策略；full reflow 还冻结精确 V2 Working Copy rowVersion/documentDigest。
- 持久 worker 已接入统一 claim/heartbeat/recovery；初次模式生成完整 V2 文档，整章重排生成一个 smart `layout.resize_profile` 批次。当前运行时未接外部视觉 Provider，分析模式诚实记录为 `rule_fallback`；`scoped_reflow` 在 M6 扩展作用域前 fail-closed。
- initial apply 在单事务内创建 V2 Working Copy 和应用凭证；full reflow apply 只创建 V2 PendingEditorCommandSet 与凭证，不修改当前工作稿。重复应用仅在目标仍匹配时 replay；用户已经编辑、预览已应用/放弃或来源变化时返回冲突。
- 真实数据库集成已证明：任务幂等创建、worker 完成、初次应用/重放、caption balloon 落稿、用户修改阻止旧结果覆盖、Nest 重启保留工作稿、整章重排先预览且不改工作稿、确认后才增加 rowVersion、重复应用冲突。

### M4 验证

- **状态：** complete
- `pnpm prisma:generate`、`pnpm prisma:validate`、Shared build 与 Server typecheck 通过。
- migration 定向 4 文件共 6/6 passed，覆盖旧行保留、V1→V2、禁止 V2→V1、作用域/不可变 trigger 和发布 migration ledger=18。
- M4 真实数据库集成 1/1 passed；相关 Server 回归 9 files、27/27 passed，包含 renderer 5/5。
- Shared 全量 35 files、213/213 passed；M4 composition contract 3/3 passed。
- M4 是服务端与持久化闭环，不等于普通用户页面已经可用，也不等于真实视觉 Provider 已接入。下一阶段为 M5 统一工作台和浏览器零设置路径。

### 2026-07-23 M5 统一漫画成稿工作台

- **状态：** complete
- 用户可见第 6 步已统一为“漫画成稿”。没有 Working Copy 时，页面会自动创建、等待并应用 initial V2 成稿；已有成稿时直接恢复到同一个正式编辑器，不再要求普通用户先选模板、画布尺寸或创建数据库草稿。
- 原有编辑画布消费 V2 的可见 V1 投影，但保存事实始终是完整 V2。人工移动、缩放、裁切、改字、改样式、改尾巴和增删对象统一以 `actor=user` 回写，保留 automation、dialogue binding 和字段级 protection；绑定气泡的隐藏、删除与恢复使用语义命令。
- “重新排一版”会避开当前可见摘要，生成另一份合法候选。用户先看“当前排法 / 新排法”具体对比，再选择“保留当前排法”或“使用这版新排法”；应用后可使用同一撤销栈 Undo。放弃预览不修改 Working Copy。
- 条漫浏览器路径已覆盖：自动成稿、直接编辑、整章重排预览、应用、Undo、手动新增气泡、保存和 user protection。页漫路径已覆盖：自动生成 page canvas、刷新不重复生成、预览新排法并放弃后 Working Copy 不变。
- 页面诚实显示当前运行时使用分镜、图片尺寸和对白规则生成，不宣称已经由视觉 AI 看懂画面。真实视觉 Provider、场景/页面/段落/选区的 scoped reflow 和 V2 正式出版继续留给 M6/M7。
- 为保证重排与恢复稳定性，full reflow 增加当前可见摘要避让；V2 recovery 无损恢复；Pending 结果若与当前稿可见摘要相同，只收口应用状态，不产生无意义的 rowVersion 写入。

### M5 验证

- **状态：** complete
- `pnpm typecheck`、`pnpm typecheck:e2e` 与 Web production build 通过。
- Shared 全量回归 35 files、214/214 tests passed；Server 全量回归 128 files、759/759 tests passed。
- M5 条漫/页漫真实浏览器路径 2/2 passed；file-mode 项目/阶段栏 4/4 passed；candidate decision、既有 layout editor M4～M8 同批浏览器回归通过。
- 三张运行证据已人工检查：`evidence/m5-workspace/自动成稿直接编辑.png`、`evidence/m5-workspace/整章新排法对比.png`、`evidence/m5-workspace/页漫自动成稿.png`。
- 完整回归暴露并修复两项测试健壮性问题：来源摘要篡改用例改为保证最后一位确实变化；启动六个 CLI 的备份参数矩阵用例超时上限调整为 15 秒。两项均只修复测试在并行负载下的不确定性，没有放宽业务断言。
- M5 完成后进入 M6：优先接真实视觉分析 Provider，再开放受保护作用域内的局部智能调整；158 项 A/B 继续作为可选内部研究，不作为普通用户流程或 M6 的强制入口。

### 2026-07-23 M6 真实视觉分析通道与局部智能调整

- OpenCode 结构化运行时新增受限图片附件：仅接受 PNG/JPEG/WebP data URL、最多 8 张，并校验文件名和大小；消息继续关闭全部业务工具，只开放 `StructuredOutput`。
- 新增 `LayoutVisualAnalyzerService`：从 DB ready Asset 重建素材，校验 storageKey/realpath/字节数/SHA-256/尺寸/MIME，转为最大边 1536px JPEG 后按 Shot 请求严格视觉 JSON。Provider 只能给主体/脸部、关键区域、文字安全区和视觉中心，角色映射、Asset 身份、warning 和 digest 由本地 adapter 决定。
- 每个 Shot 独立超时和回退；非法结构、伪造角色、失败或未配置均产生严格 `rule_fallback`，不阻断画格和对白。最近 30 个成功任务中相同 `assetId + assetDigest` 的 vision 分析可复用；任务只保存规范化结果，不保存原始模型输出或凭据。
- composition source 冻结 `providerId/modelId` 而不冻结 key/base URL/secretRef；output 新增可追溯 `visualAnalyses` 和 `mixed` 模式，旧任务缺字段时兼容为空数组。
- Shared 新增 `scoped-reflow.ts`：canvas 表示当前页/段；选中 element 扩到完整 NarrativeGroup；纯 shot scope 扩到同 scene 后再扩完整 NarrativeGroup。不存在或不含分镜内容的目标直接拒绝。
- 局部重排只生成画格 geometry、图片 crop、气泡 geometry/style/tail 命令；不改对白、来源、阅读顺序，不增删对象。保护和 `locked` 逐字段跳过并提示，不让安全的其他修改一起失败。full reflow 遇到人工保护时也降为全画布细粒度安全命令。
- 视觉规划补充高权重 focal region 的裁切和气泡避让，脸、手、武器、关键动作与关键物体可通过同一结构化区域受到保护。
- 工作台新增“智能调整”：有选中对象默认选区，否则默认当前页/段；可改为当前场景，并提供“对白更清楚 / 突出重点 / 更紧凑 / 更舒展”。结果仍进入当前/新排法预览，可保留、应用和一次 Undo。
- 选中对象存在人工 protection 时显示“允许智能再次调整”；执行后只清除该对象及嵌套 panel image 的保护，不解除显式锁定。
- 本轮没有调用付费外部视觉模型；provider 通道由本地假结构化服务验证。M6 完成表示接线、作用域和安全闭环完成，不代表某个付费模型的审美质量已签收。

### M6 验证

- `pnpm typecheck`：通过。
- `pnpm typecheck:e2e`：通过。
- `pnpm test`：Shared 36 files / 218 tests，Server 129 files / 763 tests，全部通过。
- `pnpm --filter @airoaming/server build`：通过。
- `pnpm --filter @airoaming/web build`：通过；仅保留既有大 chunk warning。
- `AIROAMING_E2E_PERSISTENCE_MODE=db pnpm exec playwright test tests/e2e/web/layout-smart-compose-m5.spec.ts --project=chromium`：2/2 通过。
- M6 数据库集成覆盖 scoped task、细粒度 smart command、Pending 预览不改 WC、确认应用和行版本变化。
- 浏览器条漫覆盖选中画格预览、应用、Undo 与保护解除；页漫覆盖当前页预览和放弃不改 WC。
- 证据：`evidence/m6-workspace/条漫选中画格智能调整预览.png`。
- 首次直接运行 Playwright 未设置 `AIROAMING_E2E_PERSISTENCE_MODE=db`，两条用例均在 fixture 准备阶段收到 `G2_DB_MODE_REQUIRED`；按项目正式 DB matrix 入口重跑后 2/2 通过，未把环境错误记成功能失败。
- M6 退出后进入 M7：接通 V2 来源更新、阅读预览、Revision/publication 和真实下载，不建立第二套导出服务。
