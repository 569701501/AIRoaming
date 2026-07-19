# 任务计划：镜头视觉编译层

---
doc_id: AIR-TASK-20260719-SHOT-VISUAL-BRIEF-PLAN
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户对候选图画面描述诊断后的方案讨论
---

## 目标

以市面上成熟分镜/视觉生成产品的公开操作为主要参考，再结合现有七阶段流程和任务协议，确定“剧情分镜转成可执行镜头描述”放在哪里、哪些能力自动执行、哪些交给用户编辑，且不新增第八个顶层步骤、不破坏出图准备纯门禁。

## 非目标

- 不新增第八个顶层步骤，不把出图准备改成生成或修复页。
- 首版不新增数据库 Schema 或独立 `ShotVisualBriefRevision`；手工编辑作为当次生图输入，AI 优化结果由现有 GenerationTask 留痕。
- 不调用图片 Provider；文本 Provider 只在用户以后真实点击“AI 优化”时调用，实施和自动测试不发起付费请求。

## 当前阶段

阶段 6：交付与留痕已完成。

## 阶段列表

### 阶段 1：需求与事实源恢复

- [x] 复用真实 12 镜诊断和市场调研结论
- [x] 读取产品流程、任务协议、模块事实源和 ADR-0017/0018
- [x] 检查 `shot_prompt_generate` 当前生产接线
- **状态：** completed

### 阶段 2：方案与用户确认

- [x] 区分市场产品公开可确认的能力与无法确认的内部实现
- [x] 归纳剧本拆镜、Elements/参考绑定、可编辑 Prompt、局部重做等共同做法
- [x] 将首版“独立强制整理环节”纠偏为“分镜先产出基础描述，工作台可见、可改、可按需 AI 优化”
- [x] 用户确认方案
- **状态：** completed

### 阶段 3：Worker 实施

- [x] 用户明确授权实施
- [x] A：深化 `storyboard-shot-generate` 单帧可视描述规则，新增候选图纯函数冲突检查与合同测试
- [x] B：深化现有 `shot_prompt_generate`，新增窄职责“镜头描述优化” Skill，返回可编辑建议而不覆盖分镜
- [x] C：候选图工作台接入画面/动作/构图编辑、AI 优化建议、冲突提示和当次生图 override
- [x] D：同步产品、任务协议、模块与验收文档，完成聚焦回归
- **状态：** completed

### 阶段 4：Scrutiny Review

- [x] 复核模块 seam、来源 freshness、草稿 freshness、批量零任务边界和测试证据
- [x] 两轮发现问题均退回 Worker 修正后重新复核
- **状态：** completed

### 阶段 5：Runtime/User Review

- [x] 用真实 12 镜只读检查可读性、冲突提示、按钮状态和浏览器错误
- [x] 用隔离 DB Chromium E2E 验证编辑、阻断、优化、显式采用与正式分镜不变
- [x] 明确真实图片 A/B 未获单独授权，本轮不执行
- **状态：** completed

### 阶段 6：交付与留痕

- [x] 更新产品、任务协议、模块、长期事实源、完成记录和验收结论
- **状态：** completed

## 关键问题

1. 已确认：分镜阶段产出基础画面描述，候选图工作台可直接编辑，只对有需要的镜头单镜或批量“AI 优化”。
2. 已确认：首版先深化现有分镜 Skill 与 `shot_prompt_generate`，不新增用户必须通过的画面整理关卡。
3. 已确认：地点、人数、主客体或文字禁令冲突由系统明示警告，AI 不自行改剧情。

## 已做决策

| Decision | Rationale |
| --- | --- |
| 不推测竞品内部是否使用 Skill | 公开资料只能证明产品能力和用户路径；Boords 公开称 Agent，LTX 称 Elements/Retake，Google 称 Prompt Rewriter，都不能证明其内部目录或模块形态 |
| 撤回“不把视觉描述放进分镜生成”的绝对结论 | Boords 在导入剧本时就生成 image prompts，LTX 在生图前展示并允许修改 Shot Breakdown；因此基础可视描述应在分镜产出时就存在 |
| 不新增强制的顶层“整理本章”环节 | 主流产品把提示词生成/重写放在剧本拆镜或单帧生图界面，并保持对用户可见、可编辑 |
| 先深化 `storyboard-shot-generate` 的基础画面描述 | 一句可视镜头描述和结构化镜头字段应伴随 Shot 产生，不应等到付费生图时才被暗中改写 |
| `shot_prompt_generate` 改为按需、可见的 AI 优化能力 | 对齐 Boords 的单帧 Prompt 自动补全和 Google 的可编辑 Prompt Rewriter；它不是新的强制关卡 |
| 不把视觉编译塞进 Provider Profile | 三家会各自解释，语义漂移且无法在付费生图前统一预览 |
| 不放进出图准备 | ADR-0018 已固定出图准备是纯检查门，不生成、不修复 |
| `image-candidate-generate` 继续只做确定性编译 | 参考绑定、槽位裁决、Provider 语言/参数和成图合同与创作性重写分开，便于预览、验证和回放 |

## 阻塞项

无。当前工作区已有一组用户所属的版本链/Freshness 未提交修改；本任务必须保留它们，只在不可避免时小心叠加 `packages/shared/src/dto.ts`。

## 验收标准

1. 新生成分镜的 `comic.panelDescription` 是一个地点、一个可见瞬间、一个机位，不写声音/气味/持续时间/气泡文字。
2. 候选图工作台展示可编辑的画面、动作和构图；修改后的预览与最终 `image_generate` 使用同一组 override。
3. `shot_prompt_generate` 真正调用文本运行时，只返回可见候选修改和警告，不改 StoryboardVersion、PreflightRevision 或任何图片。
4. 文字禁令冲突、跨地点/多时刻、不可见语义、多角色主客体不清、群体数量不明等能在付费生图前看到固定问题代码和人话提示。
5. 无数据库 Schema 变更；无图片 Provider 调用；旧任务和旧 CandidateGenerationSpec 仍可读。

## 当前深思熟虑角色边界

- Orchestrator：已完成事实恢复、市场核对、seam 定位、用户确认、实施切片和最终 Handoff。
- Worker：已完成实现；Scrutiny 发现的旧模式误导、批量部分创建、警告绕过硬伤和旧建议覆盖新草稿均已回到 Worker 修正。
- Scrutiny Review：最终通过；无 Schema/migration 变化，来源、任务和显式采用边界成立。
- Runtime/User Review：非付费路径通过；真实图片 A/B 因未获单独授权明确留待后续。

## 退出结论

所有强制验收标准均已满足。功能在当前无新 Schema 边界内完成，真实图片质量仅保留为后续授权后的 A/B，不阻塞本任务交付。
