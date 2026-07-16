---
doc_id: AIR-TASK-20260716-DOWNSTREAM-PROMPT-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 2026-07-09 外部提示词借鉴方案、当前生产实现与用户授权
---

# 分镜与生图提示词优化任务计划

## 1. 目标

在现有产品流程、页面展示字段和 DB Schema 不变的前提下，完成以下生产提示词升级：

- P23：角色预览图与定稿参考图；
- P24：场景参考图；
- P25/P26：候选图真实 provider Prompt 与页面预览；
- P06：根据下游实际需要反推分镜画面描述和 Prompt 契约。

吸收外部成熟做法时只复用结构和质量标准，不复制第三方完整文本、IP、艺术家名或项目私有协议。

## 2. 非目标

- 不增加页面字段、普通用户确认节点或新的工作流步骤。
- 不增加数据库 migration、Prompt 管理后台或万能模板表。
- 不在本任务引入 ComfyUI 节点编辑器、LoRA 训练、inpaint、视频生成或复杂风格市场。
- 不把所有 provider 强行当成支持独立 negative prompt。
- 不用自动评分替代真实图片的人工判断。

## 3. 固定事实源与边界

| 层级 | 责任 |
| --- | --- |
| Storyboard / Character / Scene / Style | 提供已确认内容事实 |
| 领域 Prompt Spec | 组织主体、动作、构图、环境、光线、身份一致性、风格和排除项 |
| Provider Profile | 把领域规格编译为当前模型真正接收的字符串和参考图策略 |
| 页面预览 | 展示服务端权威规格/编译结果，不另拼第二套 Prompt |
| GenerationTask | 冻结实际规格、摘要、参考资产和尺寸，供 worker 精确执行 |

## 4. 阶段与退出标准

| 阶段 | 工作 | 退出标准 | 状态 |
| --- | --- | --- | --- |
| D0 事实与基线 | 核对 P06/P23-P26 的当前生产入口、provider 能力和旧方案 | 明确重复拼装、输入/输出和不改边界 | completed |
| D1 Prompt 部件与夹具 | 建可组合部件、provider-neutral 规格和固定正反样例 | 角色、场景、单人/多人、动作/对白/结尾镜头夹具可重复断言 | completed |
| D2 P23/P24 | 升级角色预览/四视图和场景环境参考 Prompt | 角色身份锚点清楚；场景可复用、无人、无字、空间/光线稳定 | completed |
| D3 P25/P26 | 统一普通与 DB 持久任务的候选图规格、预览和 provider 编译 | 页面与真实任务同源；不再存在 DB 薄 Prompt；provider 不收到不支持的参数语义 | completed |
| D4 P06 反推 | 强化漫画镜头语言、单帧可画性、阅读顺序、气泡安全区和下游画面事实 | 分镜输出能稳定供候选图规格使用，不提前生成最终图片 Prompt | completed |
| D5 验证与复核 | 单元/集成/构建、静态复核、浏览器或 fake-provider 运行复核 | 固定样例通过，页面流程不变，Handoff/Reviews/完成记录齐全 | completed |

## 5. 强制验收标准

1. 候选图 Prompt 只有一个服务端权威 builder，普通路径、DB task、页面预览共用同一领域规格。
2. 候选图必须表达一张干净底图、一个场景、一个静态瞬间和一个主要构图；不得生成文字、气泡、分格、拼贴或角色设定表。
3. 角色参考图必须区分 preview 与 final，固定单角色、身份一致、服装和比例稳定；final 明确四个视图。
4. 场景参考图必须是可复用环境资产：不出现人物、文字、UI、水印；包含空间层级、视角、透视、时间、天气、光线和固定地标。
5. 领域 negative constraints 保留结构化可审计语义；实际 provider Prompt 由 profile 编译，不无条件追加统一 `Avoid:`。
6. 分镜仍输出当前 `StoryboardShot` 字段，不新增页面字段；Prompt 强化只落到已有 `panelDescription/composition/coreAction/emotion/promptDraft`。
7. 固定测试覆盖单人、多人、无角色、对话镜头、动作镜头、结尾钩子、场景污染、文字污染和错误整页漫画语义。
8. 真实 provider 出图若涉及凭据或付费，只在用户明确授权的隔离验收中执行；本任务先完成 fake-provider 与页面预览闭环。

## 6. 回滚边界

- 本轮 P23/P24、P25/P26、反推 P06 与验证作为一个可回滚的下游提示词切片提交；不修改前面已确认的产品流程。
- 不删除旧历史 Candidate/Prompt；新任务只使用新 builder 生成的新规格。
- 若 provider 编译存在争议，保留 provider-neutral spec，不回退为多处硬编码长字符串。

## 7. 任务完成条件

- D0～D5 全部完成；
- `progress.md`、`findings.md`、Handoff、Scrutiny Review、Runtime/User Review 与功能完成记录齐全；
- 长期有效结论同步到正式文档和 `MEMORY.md`；
- 工作区测试、类型检查和构建通过，或对非本任务失败给出隔离证据。
