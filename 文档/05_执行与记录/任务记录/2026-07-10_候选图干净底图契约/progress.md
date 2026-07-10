---
doc_id: AIR-TASK-20260710-CLEAN-CANDIDATE-CONTRACT-PROGRESS
status: in_progress
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent
source: 本任务执行记录
---

# 候选图干净底图契约进度记录

## 2026-07-10 Orchestrator

- 用户明确要求使用 `$deep-think` 制定计划，本轮不实现。
- 建立任务三件套，目标覆盖 Prompt、参考图、provider、任务追溯、旧候选、测试与真实运行验收。
- 下一步读取正式产品/契约/模块文档并复核完整代码链路。

## 2026-07-10 Worker：契约与架构方案

- 核对 Candidate、Shot、GenerationTask、Asset、preflight、provider 和 workspace 路径事实源。
- 发现正式任务协议允许客户端传 raw positivePrompt/referenceAssetIds，而当前业务又需要不可绕过的干净底图约束；确定由后端构建权威 GenerationSpec。
- 确定 Prompt 排除 chapter/dialogue/caption/motion/page-format，并建立不可编辑 system constraints。
- 确定 preview API 与 worker 共享同一规格来源。

## 2026-07-10 Worker：引用与 Provider 方案

- 设计 shot 级 CandidateReferenceResolver，只绑定当前 shot 角色与 scene。
- 选择单人 preview 作为 V1 安全身份引用，避免四分格 final sheet 直接污染布局。
- 核对三家官方能力：Grok 多图最多 3 张且可设比例、单图继承输入比例；OpenAI GPT Image 最多 16 张输入并支持固定 size；Seedream 支持多图和 size。
- 确定未知能力和适配失败统一降级为纯文生图并 warning，禁止静默只取第一张。

## 2026-07-10 Worker：实施与验收计划

- 拆为回归夹具、权威规格、shot 引用、多 provider adapter、版本追溯、真实运行验收六阶段。
- 定义 legacy 候选非破坏兼容、reference mode 安全开关与 provider 放行标准。
- 输出正式计划：`文档/04_方案与决策/2026-07-10_候选图干净底图生成契约修正计划.md`。

## 2026-07-10 Scrutiny Review

- 静态复核通过：计划与现有七步 workflow、Candidate.shotId、preflight 和素材追溯原则一致。
- 本轮没有修改代码、正式数据契约或用户素材；正式计划状态为 draft。
- Runtime/User Review 尚无运行产物；未来验收清单已写入计划。

## Handoff

- 用户确认后从阶段 0 测试夹具开始，不直接先改 Prompt。
- 第一条可安全验证的纵切是“后端权威 spec + 无参考纯文生图”；确认单镜头/尺寸正确后再恢复 provider 多图引用。
- 实施时必须保护当前工作树中已有 Grok 设置和 Prompt 的未提交改动。

## 2026-07-10 Orchestrator：实现启动

- 用户回复“继续”，确认按既定方案进入实现。
- 采用 `$deep-think` 管理阶段与复核，采用 `tdd` 逐条执行红灯 → 绿灯 → 重构。
- 基线证据：`corepack pnpm test` 通过（shared 15、server 48），`corepack pnpm -w typecheck` 三包通过。
- 当前阶段只推进后端权威 `CandidateGenerationSpec` 与历史污染回归测试；真实 provider 调用仍不执行，避免未经确认产生费用。

## 2026-07-10 Worker：TODO 1 无费用契约闭环

- 新增 `image-candidate.contract.integration.spec.ts`，使用临时 workspace 与 mock 图片 provider，从公共 `ProjectsService` 预览和 `TasksService` 创建入口贯穿真实 guard、worker、Candidate、Asset 和任务 artifact。
- 红灯首先校正夹具中的 storyboard 角色 ID，随后稳定落在真实缺口：provider 返回比例错误的图片时，任务仍成功但没有任何 warning。
- 新增 `getImageAspectRatioWarning`；允许像素尺寸不同但比例等价，无法读取尺寸或比例超出 3% 容差时写入 Asset meta 与 task output warning。
- 证据：`corepack pnpm test` 通过（shared 15、server 60）；`corepack pnpm --filter @airoaming/server typecheck` 通过；`git diff --check` 通过。
- 本阶段没有调用真实 provider，没有产生模型费用，也没有修改用户现有候选素材。

## 2026-07-10 Worker：TODO 2 引用优先级与降级证据

- `CandidateGenerationReference` 新增显式 `priority`：当前 shot 第一个主体为 100，当前场景为 90，其余主体按 storyboard 顺序递减。
- Grok 超过 3 张引用时确定性选择优先级最高的两个角色主体和当前场景；单引用为保持目标比例降级文生图。
- OpenAI（16 张上限）和 Seedream（10 张上限）超过上限时统一按 priority 裁剪。
- 所有超限或单图降级 warning 均记录具体省略的 assetId，例如 `candidate_references_omitted:grok:...`，task output 与 Asset meta 可追溯。
- 证据：`corepack pnpm test` 通过（shared 15、server 61）；`corepack pnpm -r typecheck` 三包通过；`git diff --check` 通过。

## 2026-07-10 Worker：TODO 3 页面语义与协议收口

- 候选工作台不再把“竖滑条漫 / 画风”并列成疑似 Prompt 内容，改为“画风 / 目标画幅”，明确 `2:3 竖幅` 只控制请求尺寸、不把页面格式名写入 Prompt。
- 服务端 Prompt 展开区新增镜头级参考计划，展示主主体、场景、次主体和 priority；实际使用/省略仍以任务 output 和 Asset meta 为准。
- 任务卡可显示引用省略、Grok 单参考降级和输出比例不一致 warning。
- 运行复核发现第二主体 priority 显示 79，校正为 80；真实项目接口现返回 100 / 90 / 80。
- 正式 `生成任务协议.md` 已从客户端 raw Prompt/引用契约改为服务端权威 CandidateGenerationSpec，补充 provider 裁剪、legacy、task artifact 和尺寸 warning 规则。
- 本地候选工作台实测：页面加载正常，Prompt 展开正常，引用计划显示正常，控制台 0 warning/error；未点击生成。

## 2026-07-10 Scrutiny Review：实现静态复核

- 结论：**通过静态复核，尚未完成真实 provider 视觉验收。**
- `corepack pnpm -r build` 成功；仅保留既有 Vite chunk 大于 500 kB 的非阻塞 warning。
- `corepack pnpm test` 成功：shared 15、server 61；候选图端到端测试贯穿临时 workspace、任务 guard、worker、Candidate、Asset 与 task artifact。
- `corepack pnpm -r typecheck` 三包通过；`git diff --check` 通过；候选相关目录无 `[DEBUG-*]` 残留。
- 页面运行证据：真实项目候选工作台能显示 `2:3 竖幅`、干净底图契约、参考优先级 100/90/80；控制台 0 warning/error。
- 残留风险：配置的 Grok 是第三方中转，真实 `/images/edits` 多图字段仍需调用验证；生成模型仍可能偶发文字/分格；Grok 多人镜头最多使用两个角色主体和一个场景。

## Handoff：TODO 4 单镜真实验收

- 建议目标：第 1 章 `shot_001`，候选数量 1；现有候选采用追加批次，不覆盖旧图。
- 当前激活 provider：Grok，模型 `grok-imagine-image-quality`，通过已配置中转 API；执行会向该中转发送当前 shot Prompt 和三张镜头级参考图，并可能产生一次模型费用。
- 验收：单幅、无文字/气泡/分格；目标 2:3；只出现年轻船员、老船员和当前海面/黑鲸号场景；task output、Asset meta 与任务 artifact 中的 digest、引用、实际尺寸一致。
- 未经用户明确确认，不执行该调用。

## 2026-07-10 Runtime/User Review：真实 Grok 首批结果

- 用户实际对第 1 章 `shot_007` 生成 4 张候选，任务 ID 为 `1ddd61e0-3585-4d6c-b6af-6bc77f71fcc5`；均以追加方式保存，没有覆盖旧候选。
- 用户截图精确匹配候选 1 `candidate_251737ed-f497-47f7-b540-36f50d5864ad`；输出为 832×1248，保持精确 2:3 比例。
- 通过项：四张均为单镜头全幅构图，没有漫画分页、分格、边框、气泡或旁白框；任务、Candidate、Asset meta 与 artifact 均保留 `shot_clean_plate`、spec digest、引用和实际尺寸。
- 未通过项：四张均继承屏幕、白板、文件标签上的可读或伪文字；候选 1 明确出现 `VENTILATION & MAINTENANCE`。候选 4 还继承了场景参考图中的非目标女性工作人员。
- 根因证据：本次实际引用的 `scene_05/background.webp` 本身包含大量文字、文件、人物和剧情信息。Grok `multi_image_edit` 倾向保留参考图内容，现有无文字 Prompt 不能可靠消除输入图污染。
- 结论：候选图从“整页漫画”纠正为“单镜头图”已经通过，但“无文字、无无关人物的干净底图”尚未通过，阶段 11 保持进行中。
- 下一步建议：先收紧 SceneReference 为无人物、无文字的环境底板；旧场景资产未标记可用性时不自动注入，并记录降级 warning；随后只对同一镜头重测 1 张。
