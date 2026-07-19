# 发现与决策：镜头视觉编译层

---
doc_id: AIR-TASK-20260719-SHOT-VISUAL-BRIEF-FINDINGS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md、真实候选图诊断、现有产品与任务契约
---

## 需求

- 用大白话说明画面描述润色/视觉编译应加在七阶段流程的什么位置。
- 先以市场产品公开流程为依据，不臆测其内部是否使用 Skill；再决定本项目是深化已有 Skill 还是新增 Skill。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `文档/01_愿景与产品/核心用户流程.md` | 七阶段固定为分镜 → 出图准备 → 候选图；候选图在出图准备确认后生成 |
| `ADR-0018_视觉素材要求前置与出图准备纯门禁.md` | 出图准备只能检查和阻断，不能生成、润色或修复 |
| `文档/02_架构与契约/生成任务协议.md` | 已存在 `shot_prompt_generate`，输入是正式分镜、已确认出图准备及角色/场景/风格，输出是图片提示词 |
| `persistent-task-worker.service.ts` | 当前 `runShotPromptProvider` 只把预先构造的 `promptSpec` 原样返回，没有调用 AI 做视觉语义编译 |
| `candidate-generation-spec.ts` | 当前直接复制/拼接分镜、角色、场景字段 |
| `ADR-0017_OpenCodeAI技能作为Prompt事实源.md` | 稳定创作方法应在 `opencodeAI/skills/`，后端负责动态事实、固定校验、任务和版本 |

## 市场公开做法

| 产品 | 公开可确认的用户路径 | 能否证明内部使用 Skill | 可借鉴点 |
| --- | --- | --- | --- |
| Boords | 导入剧本时拆场景/动作/镜头并产出 image prompts；生图侧还能从帧文本自动生成 Prompt，用户可编辑、绑定多个角色/地点参考并保留 revision；Boords Agent 会读当前分镜上下文，歧义大时先问问题 | 不能；官方只公开 Agent 与界面能力 | 基础 Prompt 伴随拆镜产生；单帧再按需补全；Prompt 对人可见可改；有歧义不瞎猜 |
| LTX Studio | 先拆 Shot Breakdown，把角色、物件、地点变成可复用 Elements，用户在生图前审阅/拆分/合并镜头；单镜头可改描述、换模型或 Retake，不影响其他镜头 | 不能；官方产品语言是 Elements、Storyboard、Retake | 结构化拆镜先于生图；资产用 ID/标签绑定；重做是单镜局部操作 |
| Katalist | 先分析剧本中的角色、场景和行为，拆成镜头并抽取视觉信息；用户继续调整构图、角度、姿势、道具和场景 | 不能 | 不只靠一段文学描述，还提供结构化视觉控制 |
| StoryboardHero | 导入剧本后识别场景/镜头并补充细节；角色稳定外观单独保存，镜头另设景别、视角、焦点、光线等；先审批 concept，再选 description/action 作为出图依据，不满意时提修改指令重生 | 不能 | 身份资产与镜头状态分开；生图依据明示；先审阅再生成 |
| Adobe Firefly Boards | 在画布上按帧使用 Prompt、角色表/背景等参考图、风格/构图参考，再 remix/refine | 不能 | 参考职责显式、按帧迭代，而不是把一整章交给一段隐藏 Prompt |
| Google Imagen | 官方有基于 LLM 的 Prompt Rewriter，增加细节与描述性语言；“Help me write”可展示并编辑改写结果 | 只能确认是 Prompt Rewriter，不能等同于本项目的 Skill | 模型前的提示词增强可以是独立能力，但结果要对用户可见可改 |

来源：[Boords 剧本导入](https://boords.com/docs/creating-storyboards)、[Boords 生图](https://boords.com/docs/ai-image-generator)、[Boords Agent](https://boords.com/agent)、[LTX Storyboard Generator](https://ltx.io/studio/platform/ai-storyboard-generator)、[LTX Elements](https://ltx.io/blog/getting-started-with-elements)、[LTX 分镜教程](https://ltx.io/blog/how-to-storyboard)、[Katalist](https://www.katalist.ai/)、[StoryboardHero Features](https://storyboardhero.ai/features)、[StoryboardHero 完整指南](https://storyboardhero.ai/wp-content/uploads/2023/07/Storyboard-Hero-Complete-User-Guide-1.pdf)、[Adobe Firefly Boards](https://helpx.adobe.com/ca/firefly/web/create-mood-boards/firefly-boards/about-firefly-boards.html)、[Google Imagen Prompt Rewriter](https://cloud.google.com/vertex-ai/generative-ai/docs/image/use-prompt-rewriter)。

## 市场共性

1. 剧本转分镜时，就产出一句可视的镜头描述或 image prompt，不把原剧情原文直接扔给图像模型。
2. 角色、场景、物件、风格是可复用资产/Elements，镜头通过名称或 ID 绑定，不每次靠自由文本重说一遍。
3. Prompt/镜头描述对用户可见、可编辑；AI 补全或重写是界面里的能力，不是点“生图”后不可见的暗改。
4. 机位、景别、构图、姿势、光线等用结构化字段或控件表达，减少对“一大段润色文案”的依赖。
5. 修改一个镜头时局部重生/保留 revision，不把整章推倒重来。
6. 产品对外一般不叫“多个 Skill”；是否在内部使用多 Prompt、Agent 或 Skill，公开资料无法确认。

## 结合本项目的首选 seam

```text
剧本 / 剧情结构
  → storyboard-shot-generate 同时产出镜头事实 + 基础可视画面描述
  → 出图准备纯检查并确认
  → 候选图工作台直接展示基础描述 + 角色/场景 Elements + 机位/构图字段
  → 用户直接修改，或对单镜/问题镜头调用 shot_prompt_generate 做可见的 AI 优化
  → 固定校验器标记地点、人数、主客体和正负约束冲突
  → image-candidate-generate 确定性编译 Provider Prompt 与参考图职责
  → image_generate
```

这不新增一道用户必须通过的“整理本章”关卡。分镜本身要已经像分镜，候选图工作台则像 Boords/LTX 一样，让描述、资产绑定和局部重做都可见。

## Skill 形态（本项目内部实现）

市场调研不支持立即新增一个用户可见、全章强制的 `shot-visual-brief-compile` 环节。首选是两个窄职责：

1. 深化现有 `storyboard-shot-generate`：产出剧情事实的同时，必须产出一句人能读懂的单帧画面描述，并将主体、动作、地点、机位、景别、构图与光线分开。
2. 为现有 `shot_prompt_generate` 提供一个聚焦的“镜头描述优化” Skill（名称可后定）：只在用户点击或固定校验发现问题时工作，返回可编辑建议和警告，不暗中覆盖正式分镜。

第 2 个 Skill 的角色是“镜头画面编辑”，不是编剧，也不是 Provider 调参器。

输入：正式 Shot、角色稳定身份与当前镜头状态、场景稳定身份与当前环境、画风和画幅、精确来源 ID/摘要。

输出：一份不覆盖原文的候选修改，包含可读画面描述、结构化主体/动作/站位/交互建议、必须出现/禁止出现和警告。是否在首版持久化成 `ShotVisualBriefRevision` 应等用户交互确认后再定，不从竞品界面反推其内部数据模型。

硬规则：

- 一个地点、一个瞬间、一个机位。
- 声音、气味、心理和持续时间只能转成有来源支持的可见结果，否则删除或报待确认。
- 不交换谁做什么、谁承受、谁反应。
- 稳定身份与受伤、表情、姿势等镜头状态分离。
- named character 与 background group 分离；群体必须有数量或范围，不得当作一个人物。
- 发现“要求文字”与“禁止文字”等冲突时返回 `needs_review`，不得自行改剧情。
- 不新增角色、道具、地点、伤情或剧情事实。

不负责：

- OpenAI/豆包/Grok 的语言和模板差异。
- 参考图拼板、容量裁决和物理文件读取。
- Provider HTTP 参数、重试和计费。
- 数据库写入、版本状态、固定校验器。

## 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 每个镜头都强制调用文本模型 | 重复上下文、成本和等待时间增加 | 基础描述伴随分镜生成；单镜 AI 优化按需触发，可补充“仅优化有警告镜头”的批量入口 |
| 自动润色直接覆盖正式分镜 | 用户手工编辑和剧情事实丢失 | AI 优化先作为可见候选修改，用户采用后才成为当前生图描述，不暗中回写 StoryboardVersion |
| 优化结果在角色图/场景图变化后继续使用 | 描述与参考资产错位 | 若首版持久化优化结果，其来源摘要需绑定 StoryboardVersion、PreflightRevision、角色/场景 Visual 与画风，变化即 stale |
| 要求每镜逐一确认 | 用户操作过重 | 无冲突镜头自动 `ready`；仅 `needs_review` 镜头强制处理，始终允许查看和编辑 |
| 把所有工作继续塞入 `image-candidate-generate` | Skill 变成视觉策划、格式编译、Provider 调参混合体 | 分镜 Skill 产出基础描述，`shot_prompt_generate` 按需优化，候选图 Skill 只消费用户当前可见的描述并做确定性编译 |
| 把竞品界面直接等同于内部架构 | 会得出“它们也有这些 Skill”的无证据结论 | 只复用可确认的产品流程和能力，本项目的 Skill/任务/数据 seam 再按现有事实源设计 |

## 实施基线发现

- `storyboard-shot-generate` 已要求 `comic.panelDescription` 锁定单个静态决定性瞬间，但固定质量门尚未阻断跨地点、时长、声音/气味、气泡指令和角色设定图语言。
- `CandidateGenerationSpec` 已将画面、动作、构图、机位、角色、场景和风格分段，适合直接扩展固定 `visualIssues`，不需要再建一份隐藏 Prompt。
- file-mode `image_generate` 会读 `visualDescriptionOverride`，DB-mode guard 尚未读；两路都未支持 action/composition override。
- `shot_prompt_generate` 已有任务类型、幂等、来源投影、freshness 和 worker 路由，但 `runShotPromptProvider` 只返回预先编译的 Provider Prompt，没有任何文本 AI 调用。
- 候选图工作台已能读取镜头级 Prompt 预览、参考计划和任务列表；可在原位增加编辑和 AI 建议，无需新页面。
- 首版可不持久化新领域表：AI 优化结果由现有 `GenerationTask.output` 留痕，用户手工编辑随当次 `image_generate.promptSpec` 冻结；不会暗中回写不可变 StoryboardVersion。

## 最终实现结论

- 基础单帧规则已经进入 `storyboard-shot-generate` 与分镜固定质量门；漫画画格和漫剧时间过程继续分开，未把视频连续动作规则错误套到漫画底图。
- 候选图画面、动作、构图使用后向兼容 `CandidatePromptOverrides`；服务端重新编译预览和最终任务，不接受客户端提交最终 Prompt、引用、尺寸、Provider 或来源投影。
- 固定 `visualIssues` 同时服务 file/DB、预览和任务创建；确定性硬伤阻断图片任务，主客体不清和不可见信息等保守项只提示。
- `shot-prompt-optimize` 是现有 `shot_prompt_generate` 的窄职责生产 Skill：只返回建议，严格格式检查并修复一次；警告不能绕过单帧硬伤。
- AI 建议同时受上游来源和当前草稿约束。Storyboard/Preflight 变化或用户继续编辑三段草稿后，旧建议不再显示。
- 批量生成采用“全章只读预检全部通过 → 再逐任务创建”；视觉硬伤不会造成部分创建。任务提交阶段本身仍非事务批量，网络故障是已记录的残留风险。
- 无新表、无 migration；页面草稿刷新后恢复正式分镜是首版明确边界。

## 复核发现

### Scrutiny Review

- 最终通过。
- 复核发现并修复四类问题：旧 file-mode 伪可用入口、批量未全章预检、AI 警告绕过硬伤、旧 AI 建议覆盖新草稿。
- 静态检查、来源冻结、任务边界、显式采用和无 Schema 变化均符合任务计划。
- 唯一非阻断架构风险是预检通过后逐任务提交不具备全批事务原子性。

### Runtime/User Review

- 非付费路径通过。
- 真实 12 镜页面只读检查确认布局、提示、禁用状态和控制台正常；未改真实项目数据。
- 隔离 DB Chromium E2E 验证编辑、阻断、批量零任务、AI 优化、草稿失效、显式采用与正式分镜不变；fake provider 无图片请求。
- 真实图片 A/B 未获单独授权，明确留待后续，不将输入链路修复夸大为成图质量已证明。
