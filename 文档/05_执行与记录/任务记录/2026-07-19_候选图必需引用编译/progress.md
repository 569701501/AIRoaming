---
doc_id: AIR-TASK-20260719-CANDIDATE-REFERENCE-COMPILER-PROGRESS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 候选图必需引用编译 P0 进度

## 时间线

### 2026-07-19 P0-0 Orchestrator

- 已读取文档总入口、AI 上下文、写作与留痕规范、生成任务协议、素材契约、模块总览及多角色平台调研。
- 已核对共享 DTO、文件兼容候选规格、DB-only 任务创建/worker、Provider 适配和 Prompt 引用指引。
- 已确认本轮只落 P0：必需引用硬门、Grok 单参考修复、容量不足时确定性身份板、覆盖证据；结构化站位、构图板和局部 mask 修复后置。
- 未调用任何真实付费图片 Provider。

## 验证记录

### 2026-07-19 P0-1 Worker：引用计划与身份板

- 新增 `candidate_reference_plan_v1`：按当前 Provider 容量编译 `none / direct / cast_identity_board`，成功计划强制 `omittedRequired=[]`。
- 新增确定性角色身份板：固定中性背景、固定单元尺寸、无文字/编号/格线，每个来源角色只出现一次；当前技术打包上限为 12 人，超过后返回分层工作流前置错误。
- 新增直接依赖 `sharp@0.35.3`，用于 PNG/JPEG/WebP 真实解码、损坏输入硬门、缩放/留白和合成。

### 2026-07-19 P0-2 Worker：两条生成链路接入

- `ImageProviderService` 在外部调用前统一编译计划；OpenAI/Doubao 容量内继续独立直传，超限时打包角色；Grok 三角色加场景变为“身份板 + 场景”。
- Grok 单参考按官方单图编辑 JSON `image` 请求发送，不再退回文生图；由于官方单图编辑输出比例跟随输入，结果保留明确 warning，并继续由候选输出比例检查兜底。
- 文件兼容 resolver 对冻结引用缺失/不可读改为失败关闭；DB-only worker 同样禁止静默跳过缺失资产或文件。
- 文件兼容候选 Asset 元数据、任务输出和 DB-only Candidate Asset metadata v2 均保存 `referencePlan`；`usedReferenceAssetIds` 始终指向原始来源资产，不指向临时身份板 ID。
- DB-only 任务规格按镜头角色顺序冻结显示名、优先级和视觉来源类型；`final_reference` 保留为预检批准来源，Provider 输入改为另行冻结的 ready `preview_front`，两条 CharacterVisual 均进入任务来源投影。旧任务若只带四视图则在联网前失败。
- 新生成的 `final_reference` 会记录实际 preview `sourceVisualId`；候选任务优先使用该精确来源，避免角色后来更换 preview 后与已批准定稿错配。旧资产没有来源关系时只接受唯一可验证的更早 preview，不读取可变当前指针猜测。

### 2026-07-19 P0-5 Runtime/User Review 首轮：退回 Worker

- 读取标准 DB 中真实三人镜头 `shot_6e2394d093f90f395f8167fb405d7930` 的阿肃、铁锚、小棠和 `scene_01` 资产，未调用 Provider。
- 真实 `final_reference` 同时存在横向四格与 2×2 四格；由此证明固定“左侧四分之一”裁切假设错误，首次静态通过结论被运行证据推翻。
- 已退出 Review 并修改任务创建：新任务使用三人的 ready 单人 `preview_front`，定稿 Visual 继续作为预检批准来源；旧 final-only 任务失败关闭。
- 使用真实三张 WebP preview 与场景 WebP 离线编译：4 个原始条件形成“2016×944 身份板 + 独立场景”两槽，三名角色顺序正确，`omittedRequired=[]`；实际身份板人工检查无新增姓名、编号、格线或设定表排版。

### 2026-07-19 P0-3 Worker：测试

- 最终聚焦回归：6 个测试文件、26 项测试全部通过，覆盖零引用、单引用、容量内直传、Grok 三角色加场景、Doubao 超限打包、DB final/preview 双来源投影、精确 preview 来源优先、旧 final-only 任务失败关闭、确定性摘要、损坏输入、身份板技术容量、文件缺失硬门、DB worker 请求体与 Candidate Asset metadata v2。
- `corepack pnpm typecheck`：共享包、Web、Server 全部通过。
- 最终 `corepack pnpm --filter @airoaming/server test`：133 个测试文件、784 项测试全部通过。
- 未调用真实付费图片 Provider。

### 2026-07-19 P0-4 Scrutiny Review：通过

- 首次静态结论已被真实素材布局证据正式作废；最终复核只针对撤销固定裁切、改用单人 preview、补齐 final→preview 来源关系后的代码。
- `git diff --check`、Provider Profile JSON 解析、Sharp 直接依赖检查和旧省略/固定裁切分支检索均通过。
- 最终结论为 `passed`；条件覆盖、来源追溯和联网前失败关闭成立，视觉保真仍不作未验证承诺。

### 2026-07-19 P0-5 Runtime/User Review：非付费合同通过

- 使用标准 DB 的真实三人镜头与四张真实 WebP 做只读解析、解码和离线编译，未写数据库、未创建项目任务、未调用 Provider。
- 结果为 3 人身份板 + 独立场景两槽，4 个原始 Asset 全覆盖，角色顺序正确，`omittedRequired=[]`。
- 结论为 `passed_non_paid_runtime_contract`；真实 Provider 视觉 A/B 保持 `not_run`。

## 当前状态

- P0-0：完成。
- P0-1：完成。
- P0-2：完成。
- P0-3：完成；preview 单人锚点修正后的全量回归为 133 files / 784 tests。
- P0-4：完成，最终只读复核通过；前一次结论作为已失效历史保留说明。
- P0-5：完成，非付费真实素材运行合同通过；付费视觉 A/B 未运行。
