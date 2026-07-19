---
doc_id: AIR-TASK-20260719-CANDIDATE-REFERENCE-COMPILER-HANDOFF
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa, reviewer
source: task_plan.md、实现代码、测试与架构契约
---

# 候选图必需引用编译 P0 Handoff

## 已完成

- 新增统一的 `candidate_reference_plan_v1`。成功计划只允许 `none / direct / cast_identity_board`，且强制 `omittedRequired=[]`。
- Provider 容量足够时，角色与场景继续作为独立图片输入；超限时只把全部角色打成一张身份板，场景保持独立，不把角色或场景退化成纯文字。
- Grok 单参考恢复为官方单图编辑 `image` 请求；两张或三张物理参考使用 `images` 多图编辑，并显式传目标比例。
- 身份板由冻结单人 `preview_front` 确定性生成：固定中性背景和单元、无新增文字/编号/格线/水印，每个角色一次；来源顺序、布局、尺寸与摘要均进入计划证据。
- DB-only 的 `final_reference` 继续证明角色已满足出图准备要求，但不再直接进入 Candidate edit；候选任务另外冻结 ready 的 `preview_front` 及其 CharacterVisual 摘要，两条视觉来源都留在 `sourceProjection`。
- 新生成的 final 会记录实际 preview `sourceVisualId`；候选任务优先冻结这张精确来源。旧 final 没有来源关系时仅接受唯一可验证的更早 preview，多解或无解即失败，避免后续换 preview 后与既有定稿悄悄错配。
- 部署前创建的旧 DB 图片任务若只指向 `final_reference/turnaround_4view`，会在 Provider 调用前失败，避免猜测横向四格或 2×2 四格。
- 文件兼容路径与 DB-only worker 对缺失、不可读或损坏的必需引用统一失败关闭；失败发生在外部 Provider 调用前。
- 文件候选结果和 DB Candidate Asset metadata v2 保存原始来源资产、实际槽位、覆盖关系、生成模式、请求/实际尺寸与 warning。

## 验证证据

- 最终聚焦回归：6 files / 26 tests，通过。
- Server 最终全量回归：133 files / 784 tests，通过。
- 全仓类型检查：shared、web、server，通过。
- 生产代码检索确认不存在旧的 `candidate_references_omitted`、`grok_single_reference_omitted`、`selectGrokReferences` 或 `grok_reference_limit` 分支。
- 本轮真实图片 Provider 调用：0。

## 真实素材非付费证据

- 标准 DB 的三人镜头 `shot_6e2394d093f90f395f8167fb405d7930`：阿肃、铁锚、小棠及 `scene_01` 的真实 WebP 全部可解码。
- 真实 final 布局同时存在横向四格与 2×2，固定裁切方案已撤销；三张单人 preview 均可作为身份锚点。
- 三张真实 preview + 真实场景离线编译为 2 个 Grok 物理输入；身份板 2016×944、3 列 1 行，角色顺序正确，4 个原始 Asset 全覆盖，`omittedRequired=[]`。
- 身份板经人工查看没有新增姓名、编号、格线、边框或四视图设定表；源图自身已有的服装符号/文字属于冻结角色素材，当前仅由 Prompt 指示模型忽略，未做破坏性擦除。

## 明确边界

- `referencePlan` 证明原始角色/场景条件已经被物理图片输入覆盖，不证明模型一定正确复现身份、站位或场景。
- 当前 `compositionCoverage=prompt_only`；没有新增结构化站位、构图板、mask 局部修复或 LoRA。
- 身份板 12 人是技术封装上限，不是经真实视觉 A/B 证明的质量阈值；超过后直接阻止生成。
- Grok 单图编辑的输出比例跟随输入，系统保留 warning；本轮未用伪造的第二张图片绕过官方合同。
- 派生身份板当前仅作为内存 Provider 输入；若未来要持久缓存或展示，必须按素材契约登记为可追溯 Asset。

## 后续入口

在用户重新确认 Provider、模型与预算后，使用相同的冻结角色/场景资产做真实视觉 A/B；分别评分每个角色的存在、身份、服装、动作绑定和站位，以及场景地标、空间关系与光向。若身份板在关键镜头仍不稳定，再进入结构化站位与基于 mask 的单角色局部修复，而不是继续压缩更多角色。
