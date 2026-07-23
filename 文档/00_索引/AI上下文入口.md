---
doc_id: AIR-AI-CONTEXT-001
status: active
created: 2026-05-23
updated: 2026-07-23
owner: AI漫游项目
audience: ai-agent
source: AI漫游文档体系
---

# AI 上下文入口

## 1. 项目身份

- 项目名称：AI漫游
- 前端展示品牌：绘界漫画
- 项目类型：内部生成式内容生产工作台
- 当前核心产物：结构化剧情、分镜、漫画图候选、漫画页面；素材包仍是长期产物，但 G6 开发已后置
- 后续扩展产物：轻漫剧基础视频
- 第一阶段重点：故事到分镜、分镜到漫画图候选、候选图选择、零配置智能漫画成稿与出版
- 第二阶段重点：基于已选漫画图生成基础轻漫剧视频
- 当前 UI 结论：应用入口为项目库；用户先查看或创建项目；创建项目只建立项目记录，不要求填写剧本字段；创建弹窗的用户可见标题为“创建项目”，保留两个必填字段“项目名称”和默认空的“漫画版式（竖向条漫/分页漫画）”，版式创建后不可直接修改；创建项目成功后直接进入项目工作区，并默认打开第 1 步“剧本”；项目库和项目工作区均不展示顶部搜索框；进入项目后项目工作区隐藏全局左侧导航，顶部保留返回项目列表按钮和紧凑 7 步流程栏；项目主流程为「剧本 -> 剧情结构 -> 分镜工作台 -> 出图准备 -> 候选图工作台 -> 漫画成稿 -> 素材包」；第 6 步内部 stepKey 仍为 `layout_export`、路由仍为 `/layout`；`项目角色库` 是常驻资产入口，不作为顶部主流程步骤；项目工作区首屏必须是左侧公共“对话框”、右侧“剧本文档编辑器”；右侧剧本文档当前只编辑剧本正文，不展示项目名称、故事标题、题材标签、漫画格式和画风方向等字段，也不展示“当前章节 / 故事主线 / 出场角色 / 场景列表”的最右侧信息面板；剧本阶段后续支持两种起步来源：用户通过对话框附件上传或输入框粘贴已有剧本并由 AI 整理成章节，或让 AI 生成灵感种子并在用户确认后生成章节剧本；AI 可通过 AI漫游受控工具/API 编辑章节草稿，但不能直接操作本地物理路径；对话框组件公共，但对话记录按步骤隔离，剧本步骤下一阶段应按 `projectId + stepKey + chapterId` 隔离；项目级只共享用户已确认的事实和产物；当前不默认使用大 hero 图和右侧常驻栏，主工作区优先。

## 2. 当前优先级判断

| 优先级 | 内容 |
| --- | --- |
| P0 | 故事输入与结构化、分镜生成与编辑、漫画图生成候选、候选选择、智能漫画成稿与出版、持久任务与数据库事实源 |
| P0 后置 | 素材包 V2、真实 ZIP、下载与七阶段 `exported` 总验收；保留第七步导航，本轮不写 G6 开发文档 |
| P0.5 | 基础轻漫剧视频、TTS、字幕、BGM |
| P1 | 局部重生成、角色一致性增强、批量导出、复杂版本对比 |
| P2 | 多人协作、云端扩容、商业化权限、复杂视频镜头运动 |

## 3. AI 执行前检查

开始任务前先回答：

1. 本次任务修改的是产品事实、技术契约、模块边界、执行记录，还是代码实现？
2. 是否需要创建任务目录？
3. 是否会影响数据模型、生成任务协议、素材路径或异步状态？
4. 是否需要同步功能完成记录或验收报告？

## 4. 必读事实源

```text
文档/README.md
文档/00_索引/写作规范与留痕规则.md
文档/01_愿景与产品/产品总览.md
文档/01_愿景与产品/MVP范围与路线图.md
文档/01_愿景与产品/核心用户流程.md
文档/01_愿景与产品/功能清单与页面链路.md
文档/01_愿景与产品/当前UI信息架构.md
文档/02_架构与契约/系统架构总览.md
文档/02_架构与契约/核心数据模型.md
文档/02_架构与契约/生成任务协议.md
文档/02_架构与契约/素材文件与版本契约.md
文档/03_模块梳理/模块总览与依赖.md
文档/00_索引/全流程与字段清单.md
```

实施第 6 步“漫画成稿”智能重构时，还必须完整读取：

```text
文档/04_方案与决策/ADR-0019_智能成稿与人工编辑一体化.md
文档/04_方案与决策/ADR-0020_智能成稿应用凭证独立台账.md
文档/04_方案与决策/2026-07-22_智能成稿与编辑器一体化开发方案.md
文档/02_架构与契约/2026-07-22_智能成稿规划与编辑保护契约.md
文档/06_测试与验收/智能成稿与编辑器一体化验收清单.md
文档/06_测试与验收/漫画成稿普通读者视觉验收标准.md
文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/handoff.md
文档/05_执行与记录/功能完成记录/2026-07-23_统一漫画成稿工作台.md
文档/05_执行与记录/功能完成记录/2026-07-23_真实视觉分析与局部智能调整.md
```

实施 G3 时还必须完整读取以下五份施工资料，不能只读 2026-07-11 的主方案：

```text
文档/04_方案与决策/2026-07-12_G3施工包_依赖边界与阶段门禁.md
文档/04_方案与决策/2026-07-12_G3施工包_数据库Overlay与迁移账本.md
文档/04_方案与决策/2026-07-12_G3施工包_文件兼容与旧值迁移.md
文档/04_方案与决策/2026-07-12_G3施工包_API错误与Web状态契约.md
文档/06_测试与验收/G3施工包_下游适配与可执行证据.md
```

实施 G3 剩余 G3-M 时，改为完整读取以下五份，并读取当前 D2/M6 路线；不得把原 G3-core 施工包当作 importer/cutover 说明：

```text
文档/04_方案与决策/2026-07-12_G3-M施工包_依赖边界与切片门禁.md
文档/04_方案与决策/2026-07-12_G3-M施工包_维护快照与运行态封口.md
文档/04_方案与决策/2026-07-12_G3-M施工包_导入器决议与迁移账本.md
文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md
文档/06_测试与验收/G3-M施工包_可执行验收与Luna交接.md
文档/04_方案与决策/2026-07-13_G3-D2与M6推进路线.md
文档/05_执行与记录/任务记录/2026-07-13_D2至M6连续交付总目标/handoff.md
文档/05_执行与记录/任务记录/2026-07-13_M6-A1真实切换验收补强/handoff.md
文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/handoff.md
```

当前数据库切换事实：D2 capability=`blockedIds=[]`；S0、W1、R0B、SH-10、v5 C0～C7、首写边界和 R2 OBS-01～10 已通过，production status=`completedThrough=C7`，evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`。G4-A～F=`G4_PASSED`；G5-M0～M8 技术验收与最终用户签收已通过，G5=`G5_COMPLETE`，总体=`G0_G5_COMPLETE`。旧授权门、窗口与 `BLOCKED_R2_*` 只作历史，不能覆盖当前状态。

当前漫画成稿状态必须分层理解：G5 一等编辑器、版本、来源与确定性出版底座已完成；M3C-M0～M3 已完成离线语料、V2/人工保护、规则与视觉规划内核，M3 以 `complete_with_accepted_visual_risk` 退出。M4 已实现章节级持久 `layout_compose`、服务端权威来源冻结、V2 Working Copy 保存、初次原子应用、整章重排 Pending 预览、应用凭证、幂等/冲突与重启恢复；M5 已实现首次零设置自动成稿、有稿恢复、同一 V2 编辑器手调、当前/新排法对比、保留/应用/Undo 和条漫/页漫浏览器路径。真实持久 worker 当前仍使用 `rule_fallback`，尚未接入外部视觉 Provider；scoped reflow 和 V2 publication 属于 M6/M7。用户确认的长期闭环仍是“自动成稿 → 同一编辑器手调 → 视觉 AI 局部预览，可应用/放弃/撤销”；158 项 A/B 保持真实 `pending` 并作为可选内部研究，部分气泡外观不自然是已接受风险。禁止另建第二套简化编辑器。

当前 G0～G5 剩余连续施工的唯一总入口：

```text
文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/luna_current_handoff.md
```

该入口记录已完成的无排期、依赖驱动执行结果。AUTH-C5/AUTH-C7/R2 和 G5 最终签收均已消费，不得重复申请；G6/视频不在范围内，不能自动开始。

涉及对话框真实 AI、模型添加、模型切换、provider 配置或 OpenCode 接入时，必须额外读取：

```text
文档/04_方案与决策/2026-05-25_OpenCode对话运行时移植方案.md
```

## 5. 深思熟虑使用规则

深思熟虑不再是项目默认流程。它已经迁移为 Codex 技能：

```text
$deep-think
```

只在以下情况使用：

- 用户明确说“深思熟虑”“认真规划”“先想清楚”。
- 任务跨多模块、高风险、需要正式验证或复核。
- 用户主动调用 `$deep-think`。

普通对话、小改动、文档轻量整理不使用。

## 6. 当前技术倾向

- 应用形态：Web 工作台核心优先，本地 NestJS 服务支撑，桌面壳后置。
- 前端：Vue 3、Pinia、Tailwind CSS、shadcn/reka-ui。
- 后端：Node.js、NestJS、Prisma。
- MVP 数据库：SQLite 优先，后续可切 PostgreSQL。
- 异步任务：D75 已确认 SQLite `GenerationTask/TaskAttempt` + 单进程持久 worker/lease；数据库扫描兜底、at-least-once 幂等、协作取消、图片并发 1，BullMQ/Redis 后置。
- 文件系统：本地 workspace 先行，后续可抽象对象存储。
- 视频音频：FFmpeg、TTS 服务或本地 TTS。
- Aurora 迁移原则：复用工作台、任务中心、workspace 路径、provider adapter 和 OpenCode 对话运行时经验；第一阶段选择 OpenCode 作为项目对话框 AI Runtime，但不迁移完整 Docker sandbox、计费、团队、Phaser 工具和 Aurora 专用闭环系统。详见 `文档/04_方案与决策/2026-05-25_OpenCode对话运行时移植方案.md`。
- 真工具调用：2026-06-19 起，AI 对话(OpenCode 1.17.8)通过真 function calling 自主调用工具。工具插件在 `apps/server/opencodeAI/plugin/airoaming-tools.js`，后端网关在 `src/tool-callback/`。类型 1(执行动作:角色图/场景图/提取角色/状态查询)走真工具，类型 2(生成内容:结构/分镜/剧本)保持伪工具调用。详见 `ADR-0005_真工具调用架构改造.md`。

## 7. 当前代码入口

| 入口 | 路径 | 说明 |
| --- | --- | --- |
| Web 工作台 | `apps/web` | Vue 3 + Vite + Pinia，已实现项目库首版和项目工作区第 1 步首屏；后续 5 个项目内页面仍按当前 UI 信息架构分阶段实现 |
| 本地服务 | `apps/server` | NestJS API，当前提供健康检查、workspace 信息、项目 API、任务 mock API、OpenCode 对话运行时、对话 API 和 Prisma schema |
| 共享契约 | `packages/shared` | 任务枚举、DTO、workspace 虚拟路径工具 |
| 剧本双流程严格输出契约 | `packages/shared/src/script-workflow-contract.ts` | 七个模型阶段的灵感/大纲/章节/导入分析/忠实度可执行 Schema |
| 剧本双流程来源状态 | `文档/02_架构与契约/2026-07-16_双流程来源与状态契约.md` | 0017 及生产链已实现不可变原稿、观察性分析、确认目录、整批整理/忠实度、AI/导入 pending 来源密封和逐章正式化；页面内容字段保持不变 |
| 测试安全网 | `apps/server/src/**/*.spec.ts`、`tests/e2e` | Vitest Service characterization + Playwright API/Chromium；临时 workspace、loopback fake provider 与受控进程清理 |
| 本地素材根 | `workspace/projects` | 开发期项目素材占位目录 |

当前开发命令优先使用：

```text
corepack pnpm install
corepack pnpm dev
corepack pnpm test          # 跑全部自动化测试(shared + server)
corepack pnpm -w typecheck  # 三包类型检查
corepack pnpm test:e2e      # 环境 prepare + Playwright API/Chromium
corepack pnpm test:e2e:repeat # E2E repeat-each=3 稳定性复跑
corepack pnpm test:all      # 类型、Vitest、E2E 聚合门禁
```

`corepack pnpm dev` 是 DB-only 标准入口：默认读取 `~/.airoaming/data/db/airoaming.sqlite` 与 `~/.airoaming/workspace`，并在启动服务前核验数据库文件、0001～0017 migration ledger、`PersistenceState.activationState=db_only` 和 `activatedAt`。任一条件不满足即停止，不得自动新建空库或回退 `legacy_file`。旧 file runtime 只允许由正式迁移/恢复流程显式启动。

当前 G1 已交付数据库基座的事实核对入口不是旧“文档完备性复核”，而是：

```text
文档/04_方案与决策/2026-07-11_G1数据库Schema实施契约.md
文档/04_方案与决策/2026-07-11_G1任务与Outbox实施注册表.md
apps/server/prisma/contracts/g1-schema-manifest.json
文档/05_执行与记录/任务记录/2026-07-12_G1纠偏与DB垂直切片/
文档/05_执行与记录/功能完成记录/2026-07-12_G1纠偏与DB垂直切片.md
```

G1 machine manifest 已按 ADR-0014 移除自签 Reviewer/attestation/sealed bundle/CAS 写入门禁，digest=`sha256:392bd4cb98fc29c35f43886071edced76b7e48f732e0f55a380d1e3a76f0231c`，作为冻结 G1 基线的历史生成 provenance 保留。2026-07-21 已按 ADR-0015 退役 Markdown/DSL source rebuild、Schema/migration writer/check CLI 及其专用测试，不再从 source closure 主动重建该 manifest。当前发布 Schema identity 只由 SQLite 引擎、`schema.prisma` checksum 与全部有序 migration checksum 计算；正式 migration tree 已前向追加到 0017。runtime 通过显式 catalog 精确核验 0001～0017，新增 migration 会改变 release identity，未同步 runtime catalog 时不会自动放行；冻结 G1 trigger 的真实 SQLite 语义测试继续保留。

## 8. 当前产品取舍

- 先做可控工作流，不先追求完全自动生成整部作品。
- “可控工作流”统一指 AI 分步生成、用户查看/编辑/确认后推进，不表示用户手工绘图。该七阶段状态机、确认动作和步骤门禁已在当前代码中实现，是现有基线，不是 D2 待开发功能；D2 真正后置的是跨步骤自动推进、批量调度和一键生产的详细边界。
- 当前七阶段补全入口为 `文档/04_方案与决策/2026-07-10_七阶段能力缺口与升级顺序.md`；完整验收入口为 `文档/06_测试与验收/七阶段完整链路验收基线.md`。2026-07-11 用户决定当前开发波次只到 G5，G6 素材包 V2 与 G7 ZIP 总验收后置；仍保留七阶段 workflow，不改回六阶段。`G0至G5开发文档完备性复核.md` 是开发授权前的内容/批准快照；当前 G0 实施状态以任务记录、自动化测试体系和功能完成记录为准。
- 第 6 步的用户可见名称统一为“漫画成稿”。普通首次进入应零配置自动完成布局、裁切、阅读顺序、对白/旁白、气泡和尾巴，再进入同一套一等编辑器；智能重排必须通过 pending 预览并尊重字段级人工保护。内部 `layout_export` stepKey、`/layout` 路由和正式 publication 协议不因改名而变化。
- G0 测试安全网已于 2026-07-11 实现：Vitest Service characterization、Playwright API/Chromium、独立 provider/server/web 生命周期、失败证据与 Runtime/User Review 均已建立。该段数量是 G0 当时的历史基线；当前 G1～G5 已在同一安全底座上完成并扩大覆盖，最新数量以 `文档/06_测试与验收/自动化测试体系.md` 和本轮回归记录为准。
- G1 数据库化与真实切换已完成：44 模型冻结基线及 0017 的 9 模型剧本来源状态 overlay、0001～0017 forward-only migration、final importer、SecretStore、持久任务/Outbox、Asset、Dialogue、Layout/Export、协调备份恢复、C0～C7、首笔 DB-only 业务写、file guard 和 R2 OBS-01～10 均已通过。SQLite 是唯一业务事实源；首次 DB 写后禁止 file-only 回退。backup/archive 保留，禁止 down migration。
- G2 已完成：Script 使用 Chapter Working Copy，Story/Storyboard 使用 pending version 做 copy-on-write，确认后形成不可变正式版本；Preflight 保存 storyboard + 角色/场景/风格聚合来源快照。`freshness=current/stale/historical/pending` 只从 current 指针、来源 ID 和 JCS 摘要派生，不存第二套可写真值。G2-A0～F4 的 codec、Repository、ProductionState、NewWorkGate、任务 applicability、持久 worker 与 completion transaction 均已通过；后续 importer/Outbox/capability 切换也已在 G3/R2 收口。
- G2-B1 已完成 Script DB repository、CAS/幂等、publish/clear/revert、pending/history API；G2-C1 已完成 Story pending create/update/discard/confirm、projection、source gate、CAS/replay 和 fresh SQLite 重启证据；G2-D1 已完成 Storyboard pending CRUD、stable Shot、projection、confirm/retire；G2-E1 已完成 ProductionState/Workflow 查询、reasonCodes 和四类 NewWorkGate；G2-E2 已完成 Preflight preview/confirm、SourceSnapshot 和 stale 派生；G2-F1～F4 已完成 applicability、持久 runtime、四类 worker、completion transaction、task history 和统一创建门禁。
- G2-E1/E2/F1 交付边界仍有效：production-state API 返回服务端权威 production/workflow/chapterRowVersion；NewWorkGate 对四类任务统一返回稳定 reasonCodes；Preflight API 只允许服务端重建 SourceSnapshot；TaskApplicabilityGuard 在完成前把来源/目标不再 current 的任务标为 historical。F2～F4、capability switch、Outbox 和 DB-only 切换均已由后续阶段闭合。
- G3-core、G3-M0～M4 foundation、M5-A0～A4、D2-A0～A8 与 M6-A1 隔离验收均已完成并有阶段证据；capability 当前为 8 个聚合能力、27 个仍需登记的 guarded operation（17 个 implemented、10 个 retired）、`blockedIds=[]`。已不存在的旧整本导入/reset/目录清理和旧 candidate lock operation 不再留占位。生产 SecretStore/evidence/runner、R0B/SH-10、v5 C0～C7、首写与 R2 已闭合；AUTH-C5、AUTH-C7、R2 均已按独立边界消费，不得复用或再次要求用户授权。
- G4 开发级方案已完成：CandidateLock 闭集、线性 Schema overlay、legacy direct-evidence import、preview/commit/API、工作流门禁、Web 工作台、restart/backup restore 与总体 Review 均通过。更换不改写旧 Layout/Export/Asset/current pointers/milestone，只派生来源 stale；G4 只提供 stale 来源和门禁，画布逐格/批量解决由 G5 实现。详见 `文档/04_方案与决策/2026-07-11_G4候选定稿修订与返修开发方案.md`、`文档/04_方案与决策/2026-07-11_G4候选定稿与影响预览契约字典.md` 和 `文档/06_测试与验收/G4候选定稿返修验收清单.md`。
- G5 M0～M8 技术验收与最终用户签收已完成：strict `LayoutDocumentV1`/命令、DB-only Working Copy、画格/图片/模板/裁切、FontAsset/富文本/气泡、来源返修、不可变 Revision/SourceBinding、固定 renderer、`layout_publication`、PNG/PDF/条漫切片、手机只读、AI pending 与 legacy cutover 均已通过。Working Copy 自动保存与显式不可变 LayoutRevision 分离；正式出版只读 sealed Revision。当前总体=`G0_G5_COMPLETE`，G6 已后置且不会自动开始。
- 先把漫画主链路做扎实，轻漫剧只做基础合成。
- 先固化角色、分镜、候选、素材、任务、版本模型，再优化生成效果。
- 所有 AI 输出都应允许人工编辑、选择、锁定、重生成。
- 复杂高风险任务不允许在未复核、未验证前宣称完成。
- 前端参考图只能作为视觉灵感，不能直接决定产品功能。
- 2026-05-23 起，旧工作台页面实现已清空；新的功能和页面链路已经收口，前端代码已开始按当前 UI 信息架构实现。
- 2026-05-23 项目库首版已落地：包含左侧导航、项目列表、创建项目弹窗、当时的 6 步流程预览和任务队列轻量入口；项目工作区仍是下一阶段。2026-05-25 起项目库顶部搜索框已移除。当前用户可见顶部主流程为 7 步：`剧本 -> 剧情结构 -> 分镜工作台 -> 出图准备 -> 候选图工作台 -> 漫画成稿 -> 素材包`，其中第 6 步内部 key 仍为 `layout_export`；项目角色库不进入顶部主流程。
- 2026-05-25 创建项目语义已收口：创建动作只建立项目记录，前端创建弹窗用户可见标题为“创建项目”，只保留“项目名称”一个字段，不展示内部语义或“下一步”提示文案，不再要求故事标题、题材标签、漫画格式、画风方向和故事原文。
- 2026-07-10 D1 新决策已由 G3 实现并覆盖上述“只保留项目名称”口径：创建动作仍只建立项目记录，但现有创建项目弹窗要求同时填写项目名称并选择 `竖向条漫/分页漫画`；版式创建后不可直接修改。`四格漫画` 是画布布局模板，不是项目版式。
- 2026-07-10 D3 候选返修决策已采纳并由 G4/G5 实现：收藏/草选不驱动下游；正式图片使用不可变 `CandidateLockRevision`，更换定稿前显示影响，既有画布格子派生 stale，旧布局和旧导出永久保留，长任务绑定来源修订和 lock set digest；旧 `lockedCandidateId` 不再是 DB runtime 权威路径。
- 2026-07-10 D4/D5 首版边界已采纳并由 G5 M2～M8 实现：在条漫/页漫的有限正式成稿容器内提供画格、图片、文字和气泡编排，不扩张为无限白板或专业矢量编辑器；临时多选不保存 Group，桌面编辑/手机只读、受控字体、横竖排文字、气泡、来源返修、不可变版本、正式出版与 AI pending 均已关闭。
- 2026-07-10 D7 全量数据库化已由 ADR-0012 采纳并完成：44 模型、关系核心 + 版本化 Json + 可重建投影、SQLite 单引擎、OpenCode/SecretStore 边界、持久 worker、旧任务历史导入、一次 DB-only 切换和 R2 观察均已关闭。当前无需再次请求 C5/C7/R2 授权；新破坏性动作仍必须另行授权。
- 2026-07-11 G1 进一步冻结：Importer 不直接读活动 workspace，只读 maintenance/停机生成且 pre/post manifest 一致的 snapshot；切换当刻的对话、pending 和旧任务终态通过无秘密 runtime bundle 捕获。Asset 使用 temp -> staged+Outbox -> rename -> ready；任务使用 claimToken fencing 和 `TaskConcurrencySlot`；图片 key 迁移不创建新明文备份。当前 Prisma 6.19.3 不随 G1 升级 major，关键 enum/跨字段状态由定制 migration SQL 的 CHECK/trigger 保护。
- 2026-05-25 项目工作区交互方向更新：进入项目后隐藏全局左侧导航；项目内左侧固定为公共“对话框”，右侧为当前步骤文档或工作区；顶部搜索移除，保留返回项目列表和流程栏。对话框按当前步骤注入不同提示词，AI 可给建议、总结、改写或触发受控业务工具；2026-05-31 产品口径为 7 步。
- 2026-05-25 创建后首屏要求收口：创建项目成功后不是停留在项目库，也不是进入旧“项目与故事”表单；必须进入项目工作区第 1 步“剧本”，页面布局为左侧对话框、右侧剧本文档编辑器。
- 2026-05-25 对话上下文规则已收口：项目内共用同一个“对话框”组件，但不共用一条完整对话历史；每个步骤维护自己的对话记录，切换步骤时加载当前步骤记录、当前步骤提示词、当前步骤产物和项目级已确认事实。未被用户应用、插入、保存、锁定或确认的聊天内容不能自动进入其他步骤上下文。
- 2026-05-25 OpenCode 运行时方向收口：项目对话框第一阶段采用 OpenCode 作为 AI Runtime；OpenCode Session 只作为运行时映射，AI漫游自己的 `ConversationThread`、`ConversationMessage` 和 `ProjectContextFact` 仍是业务事实源；OpenCode 不允许直接操作本地物理路径，所有项目写入必须经过 AI漫游受控工具/API、保存动作或生成任务确认。
- 2026-05-25 项目工作区第 1 步首屏已落地：创建或打开项目后隐藏全局左侧导航和顶部搜索，工作区顶部提供返回项目库与当时的 6 步流程；主体为左侧 `ProjectDialoguePanel` 对话框 UI 壳、右侧 `ScriptDocumentEditor` 剧本文档编辑器；当时真实 OpenCode 对话、上传、应用和插入能力尚未接入。当前产品口径已更新为 7 步。
- 2026-05-26 剧本页右侧已简化：`ScriptDocumentEditor` 当前只展示和保存剧本正文 `sourceText`，不再展示项目名称、故事标题、题材标签、漫画格式和画风方向字段；`WorkbenchStageRail` 已由当时的 6 个大卡片改为紧凑标签栏，当前仍需迁移到 7 步口径。
- 2026-05-26 OpenCode 剧本对话最小闭环已落地：后端新增 `ai-runtime` 与 `dialogue` 模块，可启动或连接 `opencode serve`，创建 OpenCode session，发送剧本步骤 prompt，并把 assistant 文本作为 AI漫游 `DialogueMessageItem` 返回；前端左侧 `ProjectDialoguePanel` 已支持输入、发送、展示消息和失败状态。
- 2026-05-26 OpenCode 流式输出已落地：后端新增 `POST /api/projects/{projectId}/dialogue/threads/{stepKey}/messages/stream`，将 OpenCode `message.part.delta` 转换为 AI漫游 `dialogue.message.delta`；前端使用 fetch 流式读取 SSE 并增量更新 assistant 消息。当前仍不支持停止生成、上传剧本、灵感种子生成或 AI 受控写章节草稿。
- 2026-05-26 对话框模型链路已接入，2026-07-21 清理后只保留实际使用的自动默认选择：前端启动时读取 `GET /api/ai-runtime/models`，选取 default/首项并把 provider/model 透传给后端和 OpenCode；页面没有手动切换控件，也不再保留无 UI 消费的模型列表状态和选择 action。当前不支持新增模型配置 UI、手动 model 或 variant 选择。
- 2026-05-26 项目路由骨架已落地：前端引入 `vue-router`，`/projects` 为项目库，`/projects/:projectId/script` 为剧本工作区，`structure/storyboard/candidates/layout/assets` 为后续 5 个步骤预留地址；URL 表示当前位置，Pinia 和后端负责项目快照、对话线程和临时状态。
- 2026-05-26 剧本文本编辑器已换成 CodeMirror Markdown：右侧剧本文档编辑器不再使用原生 `textarea`，支持 Markdown 标题、列表、加粗、斜体、删除线、引用、插入图片文本和纯文本保存；保存接口仍只提交 `sourceText`。右侧大纲仍未接入真实解析，本阶段不处理。
- 2026-05-28 剧本页最右侧“当前章节信息”面板已废弃：第 1 步“剧本”的当前剧本区域就是写剧本正文，不再常驻展示当前章节、故事主线、出场角色和场景列表。主线、角色、场景的整理应后置到剧情结构步骤或用户主动打开的局部结果中；AI 对话框不再提供“分析剧情”快捷入口。
- 2026-07-16 A+ 双路线已接通：AI 创作按“灵感/题材 -> 项目大纲与轻量章节卡 -> 用户明确要求生成当前章 -> 单章 pending -> 采用并编辑 -> 完成本章”推进；只有大纲存在下一章卡时才增加入口，切换不触发生成，第 N 章生成要求第 N-1 章正式。已有剧本按“不可变原稿副本 -> 观察性大纲与拆章候选 -> 整本目录确认一次 -> 创建全部章节并完成整批生成/验证尝试 -> 逐章只读确认”推进，不提供手动修改、AI 重新整理、采用、丢弃或批量确认。两条路线均已完成 DB-only Chromium 验证，只在正式 `ChapterScriptVersion` 汇合，再进入现有 StoryStructure；页面展示字段保持不变。当前增强项是超长稿分层分析、后台断点续跑和失败项重试入口。
- 2026-05-27 后端默认章节已接入：创建项目时写入 `chapters/chapter-001/chapter.json` 和 `script.md`；旧 `PATCH /api/projects/{projectId}` 仍可保存 `sourceText`，但只同步写入当前章节脚本；`story/story_draft.source.txt` 旧兼容路径已移除。
- 2026-05-27 当前章节快照读取已接入：`WorkbenchSnapshot.chapters/currentChapter` 是剧本页读取章节的主契约；剧本编辑器和剧本步骤对话 prompt 优先读取 `currentChapter`，`snapshot.story` 仅作旧链路兼容兜底。
- 2026-05-27 章节列表与章节推进已接入：剧本页支持章节列表、`/projects/:projectId/script/:chapterId`、章节级保存草稿和完成本章。2026-07-16 已修正为：完成本章发布正式版本并停留当前章；只有确认大纲存在下一张章节卡时才创建下一章入口，且不生成正文、不自动切换。
- 2026-05-27 章节作用域任务校验已接入：`story_parse`、`shot_generate`、`shot_prompt_generate`、`image_generate`、`layout_export` 创建时必须带 `target.chapterId`；`input.chapterId` 如传入必须一致，省略时由服务端规范化写回。
- 2026-06-02 项目 workflow 口径已落地：顶部主流程为 `project_story -> story_structure -> storyboard -> image_preflight -> image_candidates -> layout_export -> asset_package`；`project_characters` 已迁出顶部主流程，只保留为 `/characters` 项目级常驻资产入口。
- 2026-06-06 项目角色库流程收口：剧本大纲或导入剧本中的主角和常驻角色应创建为项目级 `Character` 草稿，AI 自动判断角色层级；角色名是项目内身份标识，普通图片生成弹窗不能改名。剧情结构和分镜阶段发现的新角色进入待处理队列，普通路径以角色图卡片、编辑生图描述 / prompt、重新生成和应用当前图为主；加入角色库、合并、标记临时或忽略属于底层归类或高级/异常处理。角色视觉定稿不阻塞剧情结构，主要在出图准备阶段阻塞候选图生成；角色定稿图一旦用于生成漫画候选图，旧参考图不能覆盖，只能创建新视觉版本。
- 2026-05-27 剧本对话再设计方案已更新：剧本阶段改为“用户提供剧本整理”和“无灵感生成剧本”双来源；用户提供剧本复用对话框附件上传或输入框粘贴，不新增单独导入主按钮；AI 可通过 AI漫游受控工具/API 整理剧本、生成章节和编辑当前章节草稿，不再把复制、插入光标和追加末尾作为主闭环。详见 `文档/04_方案与决策/2026-05-27_剧本对话功能再设计方案.md`。
- 2026-05-28 剧本阶段 AI 边界已收口：统一边界契约对所有剧本对话默认生效，具体 skill 只补任务细则；普通建议不写入，灵感先生成候选，导入/改写/生成章节必须走 AI漫游受控工具/API，覆盖非空章节、替换整本剧本、低可信拆章或跨阶段产物失效风险必须先让用户确认。
- 2026-05-29 剧本阶段最终输出格式已收口：用户上传/粘贴剧本或选择 AI 灵感种子后，写入右侧编辑器的用户可见产物统一为固定格式「章节剧本」；格式包含 `第 X 章：章节标题`，并同步为 `Chapter.title`；`剧本名称/剧集名称` 是项目级作品名，显示在章节下拉框右侧，不写进章节正文；灵感技能每次生成 3 个种子，用户可选择其一或重新生成 3 个；最终章节剧本不输出主体列表、正式场景列表、剧情节拍、分镜剧本、镜头编号、图片 Prompt 或 JSON，这些后置到剧情结构、分镜工作台和候选图阶段。
- 2026-05-24 项目删除链路已落地，2026-06-02 补齐清理边界：项目卡片右上角删除按钮二次确认后调用 `DELETE /projects/{projectId}`，删除项目记录、本地 workspace 项目目录、该项目生成任务和项目级对话运行态缓存。
- 2026-05-24 项目工作区外壳已落地：创建或打开项目后进入项目工作区，显示返回项目库、项目标题、当时的 6 步流程和“剧本”面板；故事草稿可通过 `PATCH /projects/{projectId}` 保存并写回 workspace。当前产品口径已更新为 7 步。
- 2026-06-21 剧情结构卡角色 ID 回填已落地：`StoryStructureCharacterCard` 新增兼容字段 `projectCharacterId`，指向正式项目角色实体 `Character.id`；当前 Shared 文件态 DTO 名为 `ProjectCharacter`，两者不是两套实体。AI 生成结构卡时不填（为 null），由后端在用户确认剧情结构时按 name 匹配/新建项目角色后回填；当前项目角色不可删除，name 仍是跨章节关联的二级线索。详见 `文档/04_方案与决策/ADR-0006_剧情结构卡角色ID回填方案.md`。角色档案编辑能力（改 name/role/level 等）后端接口已存在但前端无 UI，暂不补，为已知限制。
- 2026-06-21 分镜字段拆分与枚举升级已落地：`StoryboardShot` 共同核心层新增 `shotType`(景别)和 `cameraAngle`(机位角度)，comic 和 motion 共用一份；`comic.panelRhythm`、`motion.cameraMovement`、`motion.frameType` 从自由文本升为受控枚举；`motion.durationHint` 拆出 `durationMs`(毫秒数字)；`motion.voiceRole`+`line` 替换为 `motion.voiceLines[]`(支持多人对话、用 characterId)。枚举兜底逻辑抽到 `packages/shared/src/storyboard-normalize.ts`，两份 normalize 共用。兼容用 normalize 读时兜底，不写迁移脚本。前端展示也已落地：枚举字段用中文下拉、durationMs 数字输入、voiceLines 只读列表。详见 `文档/04_方案与决策/ADR-0007_分镜字段拆分与枚举升级.md` 和 `文档/05_执行与记录/功能完成记录/2026-06-21_分镜字段前端展示.md`。
- 2026-07-16 分镜与生图提示词改造已完成当前阶段：页面分镜字段和“待确认草稿 -> 用户确认 -> 正式 StoryboardVersion”流程不变；S1 已完成生成/调整、结构引用映射和正式版本接线，S2 已完成新 AI 输出严格契约、beat 覆盖/顺序/一致性等固定质量门和一次定向修复。第二次仍失败不写 pending，旧数据兼容 normalize 不变。P23 角色参考图、P24 场景参考图、P25/P26 候选图实际 Prompt/页面预览已升级，并从下游反推 P06 漫画单帧与 `promptDraft` 边界。普通任务、DB 持久任务、页面预览和 worker 共用同一候选图领域规格；Provider Profile 负责把结构化排除项编译为当前单 Prompt 网关实际接收的文本，不再统一拼接 `Avoid:`。无页面字段、Schema 或确认节点变化。下一步 S3 真实文本模型分镜验收和 S4 真实图片质量评测都需用户分别授权。详见 `文档/04_方案与决策/2026-07-16_分镜及后续提示词改造顺序.md`、`文档/05_执行与记录/功能完成记录/2026-07-16_分镜与生图提示词优化.md` 和 `文档/05_执行与记录/功能完成记录/2026-07-16_分镜固定质量门S2.md`。
- 2026-06-21 章节正文 pending 缓冲首次落地；2026-07-16 A+ 流程保留每章独立、可采用/丢弃的 pending，但废止 AI 批量生成整本和“采用即正式”口径。当前采用只进入 Working Copy，完成本章才发布正式版本；用户必须在当前章显式要求生成，系统一次只生成一章。`ADR-0008` 已标记被双流程来源与状态契约替代。
- 2026-06-21 直接题材生成大纲已落地：剧本阶段新增第 3 条链路。用户给出明确题材（如"生成全职猎人暗黑大陆篇"）时，绕过灵感种子直接生成项目级大纲（`generateScriptOutlineFromTopicWithAI`，题材来自用户输入，不依赖 seed）。判断依据：`shouldGenerateInspirationSeeds` 返回 `{trigger, mode}`，命中"生成/写/编 + 故事/篇/章/剧本"的 directContentMatch 时 mode=topic。"找灵感/点子/创意"仍走 3 选 1（现状不变）。大纲 status=draft，用户确认后才继续生成章节。详见 `文档/05_执行与记录/功能完成记录/2026-06-21_直接题材生成大纲.md`。
- 2026-06-21 角色分层双维度已落地：角色分类从单一 level(4层) 升级为 level(5层)+entityType(4类) 双维度。level 加 minor(小角色，归 chapter 出图档)；AI 生成剧情结构时显式输出 level+entityType（未输出则 inferCharacterLevel 关键词兜底，不删）。entityType 新增 human/creature/group/voice（第一批只 human 走通生图，creature/group/voice 占位 fallback）。CHARACTER_LEVEL_ORDER 抽成共享常量避免 sort/resolve 漂移。解决"角色被关键词误判 extra 导致没定稿按钮"的 bug。详见 `文档/05_执行与记录/功能完成记录/2026-06-21_角色分层双维度.md`。
- 2026-06-21 出图准备重构为"出门检查单"已落地：定位收窄为"分镜产物完整性校验 + 放行候选图"，不再当第二个角色库。砍掉 metrics 仪表盘/重复 hero/next-card 引导/未识别角色 4 动作/本章角色图列表/场景画风/镜头绑定面板，改为"就绪度一句话 + 全项检查清单(✓已完成/⚠未完成+入口) + 主按钮"。分镜 prompt 加硬约束 characterIds 只用 structure.characters 已有角色名(源头消除未识别)；4 动作前端 UI 删除(后端接口暂留)。修复 isFinalized 误判(改判 primary 是否真锁定)解决"有定稿图但 fully-locked 隐藏锁定按钮"死锁。详见 `文档/04_方案与决策/2026-06-02_角色库与出图准备流程调整方案.md` 2026-06-21 更新小节。
- 2026-06-22 ProjectsService 巨石拆分已落地：5236 行单文件拆为 1 门面 + 9 独立文件（−1516 行）。纯收口，行为与调用面不变（ADR-0005 不破）。workspace 持久化收口到 `ProjectRepository`（缓存+加载链+写入链）；领域纯函数抽成 util（workspace-json/local-types/project-domain/story-normalize/character-domain/workflow/image-preflight/reference-prompt）。buildImagePreflightJson/isChapterImagePreflightReady 改接受 isReferenceTaskRunning 回调。详见 `文档/05_执行与记录/功能完成记录/2026-06-22_ProjectsService巨石拆分.md` 和 `文档/03_模块梳理/模块总览与依赖.md` §4.14。
- 2026-06-24 sourceText 空覆盖 bug 已修复并建立测试基础设施：`saveChapterDraft`/`updateProjectDraft` 缺非空校验导致前端切章竞态误触发空保存，覆盖正式正文（AI 路径 `writeChapterDraftFromAI` 原已有校验，未受影响）。修复方式：后端两入口加非空校验（throw `CHAPTER_SCRIPT_REQUIRED`）+ 前端 canSave 判空；数据从 `script-v001.md` 历史版本无损恢复。同日首次引入 Vitest 测试基础设施：`corepack pnpm test` 聚合运行（shared + server），61 个测试锁住 sourceText 校验回归 / Repository 写入重载往返 / workflow 状态机 / 章节剧本格式 / 剧本导入分析纯函数。2026-07-11 G0 已在此基础上补 Playwright API/Chromium 与七阶段 Service 安全网；前端组件测试、Dialogue/OpenCode 完整链路仍未覆盖。
- 2026-07-21 0017 复核与旧导入退役已完成：9 张表和 20 个 trigger 均由现行 A4/B1～B5 来源密封、批次恢复、忠实度和逐章确认路径直接依赖，标准库为空不构成删除依据；Schema 和 migration 保持不变。已删除只服务旧 file-mode 整本覆盖的 `script-import.util.ts`、两层 `analyzeScriptImport/importScriptToChapters` 编排、专用测试和 capability 占位，净减 465 行生产代码、212 行测试，Server TypeScript 在该阶段为 77,683 行。历史 DTO/revision 解码只读兼容保留。
- 2026-07-21 DB-only 遗留代码收缩与收尾审计完成：累计完整删除 31 个代码文件，并移除项目级 reset/impact preview/目录清理、旧 candidate lock、同步参考图 facade、测试专用入口、失效 readiness wrapper 和无生产入口的 callback `CutoverCoordinator`；正式切换只保留 `DbCutoverService + CutoverEvidenceStore + cutover-runner`。Server TypeScript 当前为 76,376 行（生产 52,146、测试 24,230），Web TS/Vue 22,730 行，Shared 14,042 行；fresh DB 仍为 53 张业务表、242 个有效 trigger。静态审计没有剩余可安全删除的明确死代码；file fallback 需整体退役决策，项目删除 purge 必须保留但缺标准运行时调度。详见 `文档/05_执行与记录/功能完成记录/2026-07-21_DB-only遗留代码收缩.md`。
- 2026-07-21 E2E 固定结构与请求隔离已修复：loopback 假 OpenCode 对 `format.type=json_schema` 返回 `info.structured`，普通文本响应不变；候选图 Provider 审计只检查用例开始游标之后的新增请求。E2E env 36/36、prepare 3/3、file Chromium 4/4、完整 DB Chromium 15/15。详见 `文档/05_执行与记录/功能完成记录/2026-07-21_E2E固定结构与请求隔离.md`。
- 2026-06-24 ProjectsService 拆分第三轮(ImageProvider 网关)已落地：抽出 `ImageProviderService`(311 行)，把 6 个出图 HTTP 方法(requestOpenAi*/requestDoubao*/downloadDoubao*/fetchWithTimeout)+ provider 配置解析从 Service 迁出。**打破了上两轮未能解决的循环依赖**(角色编排→出图同 class)。Service 从 3518 → 3272 行(−246)。对外 generateImage/editImage，内部 doubao/openai 自动分流；调用方通过 getActiveProviderType 决定 size 差异。generateCharacterReference/generateSceneReference 改委托。纯收口，ADR-0005 不破。详见 `文档/05_执行与记录/功能完成记录/2026-06-24_角色参考图编排拆分.md`。
- 2026-06-24 ProjectsService 拆分第五轮(ProjectStore 骨架)已落地：抽出 `ProjectStore`(137 行)，收口 getReadyProject/writeProjectFiles/ensureDefaultChapterReady 等 71 处调用的核心读写骨架。**解开第四轮发现的骨架↔角色循环耦合**：writeProjectFiles 不再直接调 hasActiveCharacterReferenceTask，改 referenceTaskChecker 回调(ProjectsService.onModuleInit 注入)。Service 从 3272 → 3184 行(−88)。骨架独立后，下一轮 CharacterReferenceService 可依赖 ProjectStore 而非 ProjectsService，循环彻底解开。纯收口，ADR-0005 不破。详见 `文档/05_执行与记录/功能完成记录/2026-06-24_ProjectStore骨架抽取.md`。
- 2026-06-24 ProjectsService 拆分第六轮(CharacterReferenceService)已落地：抽出 `CharacterReferenceService`(902 行)，角色/场景参考图编排整体搬迁。ProjectsService 保留 12 个薄门面委托(ADR-0005)。Service 从 3184 → 2212 行(−972)。循环依赖在前几轮已解开(第三轮 ImageProvider + 第五轮 ProjectStore)，本轮完成最后的角色编排搬迁。resolveImagePreflightCharacter 留 Service(耦合分镜 normalizeStoryboardJson/toChapterDetail)，通过 this.characterRef 调角色辅助。6 个辅助方法(findProjectCharacter/hasActive/inferCharacterLevel/resolve*)在 CharacterReferenceService 改 public 供 Service 调用。详见 `文档/05_执行与记录/功能完成记录/2026-06-24_CharacterReferenceService抽取.md`。
- 2026-06-24 ProjectsService 拆分第七轮(ChapterScriptService)已落地：抽出 `ChapterScriptService`(726 行)，章节剧本编排整体搬迁(保存/完成/清空/草稿缓冲/导入/AI写入/大纲)。Service 从 2212 → 1650 行(−562)。这是 Service 最后一个大职责域。toChapter*/sortChapters 在新 service 内直接调 wsDomain。门面委托模式(ADR-0005)。详见 `文档/05_执行与记录/功能完成记录/2026-06-24_ChapterScriptService抽取.md`。
- 2026-06-24 ProjectsService 拆分第八轮(流程编排 Service)已落地：抽出 `StoryboardService`(分镜 254行)、`StoryStructureService`(剧情结构 354行)、`ImagePreflightService`(出图准备 346行)，实现"每个流程一个 service"。Service 从 1650 → 930 行。运行时验证发现并修复 ProjectStore `ensureDefaultChapterReady` 空字符串死循环 bug(`??` 对空字符串不兜底,改显式空判断)。详见 `文档/05_执行与记录/功能完成记录/2026-06-24_流程编排Service拆分.md`。
- 2026-07-02 DialogueService 巨石拆分已落地：全仓最大源文件 `dialogue.service.ts` 从 **3014 → 515 行**(−83%)，套用已验证的门面委托模式(ADR-0005)。按对话工作流拆出 3 个独立 service：`ScriptDialogueService`(剧本工具链 1023行)、`StoryStructureDialogueService`(剧情结构 270行)、`StoryboardDialogueService`(分镜 231行)；纯函数抽成 6 个 util(types/intent/prompt/json/text/key)。核心会话生命周期(threads/stream/turn)保留在 DialogueService。子 service 的 OpenCode session 解析器用 `setEnsureSession` 回调注入，避免重复持有线程状态；各 pending Map 按工作流归属。调用面零变更——`DialogueController` 仍只依赖 `DialogueService`。typecheck 三包通过，46 tests 全绿。详见 `文档/05_执行与记录/功能完成记录/2026-07-02_DialogueService拆分.md` 和 `文档/03_模块梳理/模块总览与依赖.md` §4。
- 2026-07-02 前端大文件拆分(低风险高收益批次)已落地：`workbench-store.ts` 1371→1086 行(17 纯函数外移到 `utils/workbench-workflow.ts`+`workbench-preflight.ts`+扩充`workbench-chapter.ts`)；`StoryboardWorkspace.vue` 1447→1329、`StoryStructureWorkspace.vue` 1335→1291(选项字典外移到 `utils/storyboard-options.ts` + 3 个内联 defineComponent 组件合并为通用 `EditableField.vue`)。沿用 `utils/*.ts` 纯函数模式(项目无 composable 约定)。关键发现：前端大 .vue 文件 60% 行数是 CSS，拆分价值在提升可维护性。高耦合的 chapter-applyer 簇和 CSS 拆分明确不做。typecheck+build 三包通过。详见 `文档/05_执行与记录/功能完成记录/2026-07-02_前端大文件拆分.md`。
- 历史 UI 试错文档已移至 `文档/98_历史归档/`，不再默认阅读。
