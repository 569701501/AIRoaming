---
doc_id: AIR-TASK-20260719-CANDIDATE-REFERENCE-COMPILER-SCRUTINY
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa, reviewer
source: task_plan.md、handoff.md、最终代码差异、测试输出与正式契约
---

# 候选图必需引用编译 P0 Scrutiny Review

## 复核结论

`passed`

结论只覆盖工程合同：必需角色/场景不会因 Provider 图片槽位不足被静默删除，来源和派生封装可追溯，缺失或无效条件会在联网前失败。它不等于真实模型已经通过角色、服装、站位和场景视觉一致性验收。

## 复核范围

- `candidate_reference_plan_v1` 的必需来源唯一性、物理覆盖、容量和失败关闭。
- `cast_identity_board_v1` 的真实解码、确定性布局、来源顺序、摘要和无新增文字/格线合同。
- file mode、DB-only 任务创建、worker 与 Provider 是否共享同一编译边界。
- `final_reference` 批准证据与 `preview_front` 物理身份输入是否分离且来源冻结。
- Grok 单图 `image`、多图 `images`，以及 OpenAI/Doubao 的直传/打包行为。
- Candidate/task/Asset 元数据是否保存原始来源、物理槽位和派生证据。
- 契约、模块、调研、Handoff 与测试是否和最终实现一致。

## 最终证据

1. 编译器先校验 Asset ID 唯一性和所有图片可解码，再根据 Provider 容量选择 `none/direct/cast_identity_board`；损坏图片、角色输入不是单人 preview、身份板超过 12 人、打包后仍超容量或任一来源未覆盖都会抛错。
2. 成功计划同时核对逻辑 `covers` 与物理输入 `sourceAssetIds`，固定 `omittedRequired=[]`；`usedReferenceAssetIds` 始终是原始 Asset ID，派生板 ID 只存在于槽位证据。
3. Grok 三角色加场景形成“全员身份板 + 原始场景”两张物理输入；单参考使用官方 JSON `image`，不会再为了输出比例退回纯文生图。
4. OpenAI 与 Doubao 在本地容量内保持独立角色/场景引用；只有超出能力表时才打包角色，场景不降级为文字。
5. DB-only preflight 的 final 只作批准证据；新 final 保存实际 preview `sourceVisualId`，候选任务优先沿该关系冻结单人身份图。旧 final 来源为空时，只接受同角色唯一一张版本更早且仍可用的 preview；无解、多解或已记录来源跨角色、类型错误、缺失、非 ready 时失败关闭。
6. 文件和 DB Asset 缺失、不可读、图片损坏及旧 final-only 候选任务都会在 Provider 调用前失败；没有继续保留按优先级省略角色或场景的分支。
7. 文件候选元数据/任务输出与 DB Candidate Asset metadata v2/任务输出均保存 `referencePlan`、原始引用、warnings、Provider、生成模式和请求/实际尺寸。
8. `corepack pnpm typecheck` 通过；聚焦回归 6 files / 26 tests 通过；最终 Server 全量 133 files / 784 tests 通过。
9. `git diff --check`、Provider Profile JSON 解析、`sharp@0.35.3` 直接依赖检查通过；生产代码和正式契约未检出旧省略策略或固定四视图裁切分支。

## 失效结论的处理

首次静态复核曾接受固定裁取四视图正面格位。随后真实资产显示同尺寸 final 同时存在横向四格和 2×2 排版，该结论被运行证据正式撤销并退回 Worker。最终版本完全删除固定裁切，只接受单人 preview；本结论是修正和全量回归后的第二次独立判定。

## 残留风险

- 身份板证明身份像素已送达，不证明模型一定不会漏人、串脸、串色或绑定错动作。
- 640×896 单元和 12 人上限是工程封装门，不是经过跨 Provider A/B 证明的质量阈值。
- 现有 preview 多为单人正面图，远景全身服饰保真仍需真实视觉测试；源图自带符号或文字也可能被模型复制。
- `compositionCoverage=prompt_only`；没有结构化站位、场景构图板或 mask 局部修复。
- OpenAI 16 张是项目适配上限，不是官方保证；Provider 能力变化时需重新核验。
- 身份板当前每个候选在内存中重新生成，可后续做内容摘要缓存，但不影响正确性。

## 判定

P0 工程合同与非付费证据满足任务退出标准，允许进入 Runtime/User Review。真实 Provider 视觉质量必须继续标记为 `not_run`，只有用户重新确认模型、请求数和预算后才能验收。
