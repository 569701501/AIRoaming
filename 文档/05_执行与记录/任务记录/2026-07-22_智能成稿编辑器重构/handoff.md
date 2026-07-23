---
doc_id: AIR-TASK-20260722-SMART-LAYOUT-HANDOFF
status: active
created: 2026-07-22
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 智能成稿编辑器重构交接
---

# 智能成稿编辑器重构 Handoff

## 1. 当前状态

- 产品方向和开发文档已获用户确认并完成落档。
- 现有 G5 完整编辑、保存、版本、renderer 和 publication 是复用基础，不需要重做。
- M0 固定语料与现状红灯基线、M1 V2 文档/兼容/人工保护合同、M2 对白归一化/叙事分组/规则 fallback 智能初稿均已完成。
- M3 strict 视觉分析、三候选稳定择优、视觉裁切/气泡/尾巴、质量评分、生产 renderer 对齐和自动预筛已实现；自动画格 69/69、气泡 59/59，连续两次生产渲染摘要一致。双次独立人工评审保持 0/2，但已按用户决策转为可选研究，不再是开发阻塞。
- 旧版合成测量图盲评页已因普通人无法识别判断标准而降级为工程证据。新版真实图 A/B 页面和 fail-closed JSON 校验器已按 `AIR-QA-COMIC-FINAL-001-v1` 完成，但用户实际复核认为重复草图无法支撑专业节奏判断，并明确授权在保留“部分气泡外观不够自然”的已知风险下继续。A/B 保持诚实 `pending`，转为可选内部研究；M3 已按 `complete_with_accepted_visual_risk` 退出。
- M4 已完成持久 `layout_compose`、权威来源冻结、V2 Working Copy 保存、初次原子应用、整章重排 Pending 预览、不可变应用凭证、幂等/冲突与重启恢复。
- M5 已完成统一“漫画成稿”工作台：无稿自动生成、有稿直接恢复、V2 在同一编辑器手调、整章当前/新排法对比、保留/应用/一次撤销，以及条漫/页漫真实浏览器路径。
- M6 已完成真实图片分析通道、逐 Shot fallback/缓存、scene/page/strip/selection scope、细粒度人工保护、局部预览/保留/应用/Undo 和主动释放保护。外部付费视觉模型未实际调用，因此具体模型审美质量仍未签收；V2 来源更新、阅读预览和 publication 进入 M7。

## 2. 开工前必读

1. `文档/04_方案与决策/ADR-0019_智能成稿与人工编辑一体化.md`
2. `文档/04_方案与决策/ADR-0020_智能成稿应用凭证独立台账.md`
3. `文档/04_方案与决策/2026-07-22_智能成稿与编辑器一体化开发方案.md`
4. `文档/02_架构与契约/2026-07-22_智能成稿规划与编辑保护契约.md`
5. `文档/06_测试与验收/智能成稿与编辑器一体化验收清单.md`
6. `文档/06_测试与验收/漫画成稿普通读者视觉验收标准.md`
7. 既有三份 G5 文档和 ADR-0011/ADR-0016。

## 3. 已完成批次：M0

已完成：

- `tests/fixtures/smart-layout/`：10 组、12 变体、69 镜、59 文字项。
- `tests/smart-layout/`：corpus、来源、评分和真实产物合同测试。
- `evidence/m0-baseline/`：真实 PNG/PDF/切片/长图、接触表、输出 manifest、现状报告、视觉复核和双人评分模板。
- 当前 V1 直接可用率：画格/裁切 5/69，必需气泡 0/59；现状为明确红灯。

M0 确认未做：

- 不改 LayoutDocument schema。
- 不接视觉 Provider。
- 不重写 LayoutExportWorkspace。
- 不创建 `layout_compose` 任务。

## 4. 已完成批次：M1

M1 已完成 Shared/兼容基础：

- 定义 strict `LayoutDocumentV2`，可见元素仍复用 V1 类型。
- 增加 `automation.composition`、持久 `dialogueBindings`、字段级 `protections` 和必要枚举。
- 建立 V1 WC → V2 保守升级：既有可见对象按适用 scope 写入 `explicit_preserve`；历史 V1 Revision 不改写。
- 建立 V2 → V1 临时 renderer projection；不得把投影回写覆盖 V2。
- 建立 Command actor/protection 更新合同及非法悬空 binding 的 fail-closed codec。
- 证明 V1→V2→V1 可见文档等价，现有 renderer golden 不变。

M1 不接 `layout_compose`、视觉 Provider、智能布局规则、气泡生成或新 UI。

主要入口：

- `packages/shared/src/layout/automation.ts`
- `packages/shared/src/layout/commands-v2.ts`
- `packages/shared/src/layout/automation.spec.ts`
- `packages/shared/src/layout/commands-v2.spec.ts`
- `evidence/m1-contract/m1-contract-report.md`

## 5. 已完成批次：M2

M2 已实现可在固定语料离线运行的 Shared 规则内核：

- 归一化 `motion.voiceLines`、legacy `comic.dialogue` 和 `comic.caption`，形成稳定 dialogue item 与 100% 覆盖账本。
- 使用 `sceneId/beatId/frameType/panelRhythm/shotType` 形成不乱序的 NarrativeGroup。
- 规则 fallback 生成条漫可变段落、页漫 3～6 格、基础 crop、完整气泡/旁白和阅读顺序。
- 使用 M1 binding/protection，不重复发明映射或直接修改正式 Working Copy。
- 固定语料达到 69/69 Shot、59/59 对白/旁白唯一覆盖、0 静默改写、0 矩形 overflow；视觉直接可用率 ≥80% 仍属于 M3。

M2 不创建 Server task、不写数据库、不改 Web、不调用视觉 Provider。

主要入口：

- `packages/shared/src/layout/dialogue.ts`
- `packages/shared/src/layout/narrative.ts`
- `packages/shared/src/layout/rule-composer.ts`
- `tests/smart-layout/render-m2-rule-composition.ts`
- `evidence/m2-rule-composition/m2-rule-output.manifest.json`
- `evidence/m2-rule-composition/m2-visual-review.md`

## 6. 已完成批次：M3

M3 只负责把“内容完整、可渲染”的规则初稿提升为固定语料上可签收的视觉初稿。已实现：

- 定义 strict visual analysis contract、置信度、坐标归一化和非法/低置信度 fallback。
- 使用主体/人脸/视觉重点/文字安全区改善 crop、气泡位置和尾巴锚点；手、武器、关键动作、关键物品的显式类型化保护仍是后续项。
- 生成 `balanced/subject_first/dialogue_first` 三套完整候选，经内容硬门、视觉软分和稳定 digest tie-break 选择；冻结 corpus 未触发后置修复，`repairRounds=0`。
- 增加椭圆/思考/喊叫气泡的 shape-safe text bounds；任何 renderer 语义调整必须同时通过现有 golden。
- 已冻结 M3 产物并完成自动预筛与用户轻量复核；用户接受部分气泡外观仍需手调的风险，M3 状态为 `complete_with_accepted_visual_risk`。158 项 A/B 保持空白，可在更合适的真实素材上作为内部研究继续。

M3 当时不创建 Server task、不写数据库、不改正式 Working Copy 或产品页面；这些能力已由后续 M4 服务端阶段补齐。

主要入口：

- `packages/shared/src/layout/visual-analysis.ts`
- `packages/shared/src/layout/visual-composer.ts`
- `packages/shared/src/layout/composition-score.ts`
- `tests/smart-layout/render-m3-visual-composition.ts`
- `evidence/m3-visual-composition/m3-visual-output.manifest.json`
- `evidence/m3-visual-composition/m3-visual-review.md`
- `evidence/m3-human-review-v2/m3-human-review-v2.manifest.json`
- `evidence/m3-human-review-v2/m3-human-review-v2-round-a.html`
- `evidence/m3-human-review-v2/m3-human-review-v2-round-b.html`
- `tests/smart-layout/m3-human-review-v2-contract.ts`

### M3 已接受的遗留项

- 部分气泡外观、形状和整体间距仍可能不自然；进入正式编辑器后必须可直接调整。
- 视觉 AI 局部优化必须先生成预览，可放弃、可撤销，不能直接覆盖用户手调。
- 手、武器、关键动作和关键物品仍缺显式类型化保护；真实素材接入时继续验证。
- 158 项 A/B 可在更合适的真实素材上重新开展；当前空表返回 `pending` 是真实状态，不是 M4 阻塞。

## 7. 已完成批次：M4

已完成：

- Shared `layout_compose` 输入/来源/输出/apply 合同，V1/V2 Working Copy 与 Pending command 兼容。
- migration 0018：保留旧 WC、允许 V1→V2 CAS 升级、禁止降级，并增加 ADR-0020 的不可变应用凭证。
- Server 权威来源冻结、persistent worker、三条 composition API、initial 原子 WC、full reflow Pending 预览和 exactly-once replay/冲突。
- 真实数据库集成覆盖任务幂等、用户手调保护、重启恢复、预览不改原稿、确认应用和重复应用冲突。

M4 退出时的限制：

- persistent worker 使用确定性 `rule_fallback`；Shared 视觉规划能力尚未接真实 Provider。
- `scoped_reflow` 在 M6 前 fail-closed；M4 只开放 initial 与 full reflow 服务端能力。
- Web 尚未调用新 API的缺口已由 M5 关闭；零设置首次入口和重排对比界面现已可用。

主要入口：

- `packages/shared/src/layout/composition-contract.ts`
- `apps/server/src/projects/layout-composition-source-projector.service.ts`
- `apps/server/src/projects/layout-composition-worker.service.ts`
- `apps/server/src/projects/layout-composition.service.ts`
- `apps/server/prisma/migrations/0018_layout_document_v2_working_copy/migration.sql`
- ADR-0020。

## 8. 已完成批次：M5

M5 只重组用户路径，没有另造编辑器：

- 无 Working Copy 时自动创建 initial composition，展示普通进度，成功后安全 apply 并打开现有编辑器。
- 有 Working Copy 时直接恢复，刷新和再次进入不会重复生成。
- “重新排一版”先展示当前稿与新排法的可视对比；“保留当前排法”不改 WC，“使用这版新排法”作为一次历史应用并可 Undo。
- V2 是唯一保存事实；现有画布读取 V1 可见投影，所有人工命令以 `actor=user` 回写 V2，因此 automation、dialogue binding 和 protection 不丢失。
- 页面使用“正在生成完整成稿 / 新排法已经准备好 / 继续编辑”等普通文案，不展示 task、digest、rowVersion 或 PendingEditorCommandSet。
- 条漫和页漫的隔离数据库浏览器路径均通过；证据位于 `evidence/m5-workspace/`。
- M5 不承诺 scoped reflow 或真实视觉 Provider。当前页面明确显示规则排版来源，不把 fallback 冒充画面分析。

退出标准已满足：条漫自动成稿、整章预览/应用/Undo、直接新增气泡并保存 protection；页漫自动成稿、刷新恢复和放弃新排法不改 WC；既有 V1 编辑/出版和手机只读 E2E 同批回归通过。

## 9. 已完成批次：M6

- `OpenCodeRuntimeService.generateStructured` 支持受限图片附件；`LayoutVisualAnalyzerService` 对 DB ready Asset 做路径、字节、SHA-256、尺寸和 MIME 复核，再发送缩放后的 JPEG。
- Provider 只返回严格视觉区域，本地 adapter 决定 Asset/角色身份、稳定 ID、warning 和 digest；逐 Shot 非法、失败、超时或无配置安全回退。
- 历史 vision 分析只按 `assetId + assetDigest` 复用；任务 output 保存清洗后的 `visualAnalyses`，不保存原始响应、路径、图片或凭据。
- canvas/element/shot scope 分别表达页段、选区和场景，并扩展完整 NarrativeGroup；不存在的目标 fail-closed。
- scoped 命令只修改 geometry/crop/balloon style/tail；手调或锁定字段逐项保留并提示，不改台词/来源/阅读顺序，不增删对象。
- 同一工作台提供“智能调整”和四种普通语言意图；所有结果仍先对比，放弃不改稿，应用可一次 Undo。
- “允许智能再次调整”只清除选中对象和嵌套 panel image 的 protection，不解除 `locked`。
- 全量 Shared 218/218、Server 763/763、类型/构建和 DB 浏览器 2/2 通过；证据位于 `evidence/m6-workspace/`。
- 本轮付费视觉调用为 0；这不妨碍规则 fallback 使用，但真实视觉模型的审美抽样仍需未来单独授权。

## 10. 下一批次：M7

- 让 V2 Working Copy 使用既有来源更新预览，不覆盖人工 crop、文字和气泡。
- 接通条漫手机滚动与页漫逐页阅读预览，并保持与正式 renderer 一致。
- 将“预览并导出”编排 autosave、preflight、V2 LayoutRevision、publication、任务恢复和真实下载。
- 普通页面继续隐藏 Working Copy、Revision、publication 等内部术语；不建立第二套导出服务。

## 11. 不可绕过边界

- 对白覆盖账本、规则 fallback 和 protection 都是默认上线硬门。
- 模型不能直接写 Working Copy 或最终像素坐标。
- 非首次智能结果不能绕过 PendingEditorCommandSet 和用户预览。
- V2 切换不能破坏 V1 历史 Revision 或现有 renderer golden。
- 不能用单个演示章节宣称达到 80% 目标。
- 不能恢复复制原图、DOM 截图或第二套轻量排版器作为失败兜底。

## 12. 实施完成时

- 更新本目录 task_plan/progress/findings/handoff。
- 新增功能完成记录和真实 evidence。
- 更新产品、架构、模块、验收和长期记忆。
- 同时完成 Static/Scrutiny Review 与条漫/页漫 Runtime/User Review。
