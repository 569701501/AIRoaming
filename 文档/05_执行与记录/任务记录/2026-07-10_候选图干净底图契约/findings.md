---
doc_id: AIR-TASK-20260710-CLEAN-CANDIDATE-CONTRACT-FINDINGS
status: in_progress
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent
source: 当前产品与代码事实源、候选图真实样本
---

# 候选图干净底图契约发现记录

## 需求理解

用户要求在已完成根因诊断和计划的基础上分 TODO 逐项实现；每项独立验证后再进入下一项，真实 provider 调用需单独确认。

## 已确认事实

- 用户样本以 SSIM `0.999160` 匹配到 `shot_015` 的真实候选资产。
- 生成时 Prompt 摘要与 Candidate/Asset 记录完全一致，包含章节名、对白、旁白和竖滑格式。
- 每个 shot 当前收到全章角色参考 ID；后端只解析第一张可读图片。
- 第一张参考是四分格角色定稿图；Grok image edit 没有传目标尺寸/宽高比。
- 当前工作区已有未提交改动移除 dialogue/caption，但仍未解决完整契约、参考选择和 provider 尺寸问题。

## 待形成结论

### Prompt 与 GenerationSpec

- 后端应成为 CandidateGenerationSpec 唯一事实源；前端只提交 shotId、candidateCount 和受控描述 override。
- preview API 与 worker 读取同一个 builder 结果，避免“预览一套、执行一套”。
- 干净底图系统约束不可被用户 override 删除。
- Prompt 排除 chapter、dialogue、caption、motion 动态过程和页面格式名；保留 comic 静态描述、构图、动作、情绪、shotType/cameraAngle、scene 和 artStyle。

### 引用解析

- 新建 shot 级 resolver，只选择当前 shot 的角色和 scene。
- V1 优先使用单人 previewReferenceAssetId；四分格 final_reference 不直接作为单图 edit 底图。
- provider 超限或缺安全引用时，省略引用并使用文字描述，产生 warning；禁止退化成全章第一张引用。

### Provider 方案

- xAI 官方确认多图 edit 最多 3 张，可覆盖 aspect ratio；单图 edit 继承输入比例。
- OpenAI GPT Image edit 支持多图输入，最多 16 张，并支持固定 size。
- Seedream 官方确认多图输入和 size；具体参数需按当前模型/接入面实现并真实验证。
- 未知模型/中转的安全默认是纯文生图，不猜测多图协议。

### 旧候选与追溯

- 旧候选不删不改，缺 spec version 时读取为 legacy_unspecified。
- 新候选记录 generationPurpose/specVersion/specDigest，旧锁定不自动解除。
- 完整 GenerationSpec 落 task input 文件，Asset meta 保存摘要、实际引用、provider mode 和实际尺寸。

### 测试与放行

- 先用真实 shot_015 结构建立失败 fixture，做 Prompt、引用与 payload 红灯测试。
- 阶段 1 暂停参考图验证纯 Prompt/尺寸，再逐 provider 恢复多参考能力。
- 每个启用 provider 用 5 类镜头、每类 2 张做真实视觉验收；复制原文、错误比例和无关角色必须 10/10 不发生，文字/气泡/分格至少 9/10 不发生。

## Web Search

- xAI 官方：单图 edit 输出比例继承输入图；多图 edit 最多 3 张并可传 aspect_ratio。
- OpenAI 官方：GPT Image edit 支持多张输入，最多 16 张；支持 1024×1024、1024×1536、1536×1024。
- 火山引擎官方：Seedream 支持单/多参考图和 size；多图输入时应明确每张图的引用用途。
- 来源链接已写入正式计划第 16 节。

## 方案文档

`文档/04_方案与决策/2026-07-10_候选图干净底图生成契约修正计划.md`

## Scrutiny Review

- **结论：通过，可供用户确认后实施。**
- 方案没有新增 workflow 步骤，保持 Candidate 属于 shot、Layout 属于 page 的现有边界。
- Server-authoritative spec 消除了当前前端 Prompt/引用与 worker fallback 的三处事实源漂移。
- Provider 降级优先保证候选语义正确，不再用错误引用换取表面一致性。
- 旧数据兼容为非破坏式，不修改现有候选文件和锁定状态。
- 残留风险是多角色一致性、用户中转兼容和生成模型偶发文字，需要阶段 5 真实样本验收。

## Runtime/User Review

本地页面与 mock provider 链路已复核；真实 provider 尚未调用。当前激活 Grok 经第三方中转，调用会发送当前 shot Prompt 与镜头级参考图并产生潜在费用，必须获得用户明确确认后再执行。

## 实现启动补充

- 现有脏工作区在实现前基线测试与类型检查均通过；可把后续新增测试的失败视为本次契约尚未实现，而不是已有 Grok 设置改动造成的基线故障。
- 实现阶段不另起并行代码分支，继续复用本任务目录，保留规划到落地的同一条追溯链。
- TODO 1 集成测试确认预览、task input、Candidate、Asset meta 与 task artifact 已共享同一 spec digest；客户端旧 Prompt、全章引用和尺寸不能穿透任务 guard。
- 新发现：只保存 `actualSize` 不足以暴露 provider 比例违约。现已把无法读取尺寸或宽高比偏差超过 3% 记录为 warning；不因像素缩放不同误报。
- 多人镜头不能把数组顺序当作隐含规则；现将主体/场景优先级写入 GenerationSpec，provider 超限选择与省略证据都由该字段确定。
- Grok 的安全策略保持不变：单引用时不用 image edit，避免继承单人预览图的方形比例；warning 现在同时写明省略原因和 assetId。

## 实现 Scrutiny Review

- **结论：通过。** 服务端权威 Prompt、镜头级单人 preview 引用、provider 裁剪、legacy 标识、任务 artifact、前端预览和 warning 展示已形成闭环。
- 自动化与静态证据全部通过；真实模型视觉结果仍是唯一未关闭的强制验收项。
- 当前不能把任务标为 completed，也不能新增功能完成记录；真实单镜验收通过后再收口方案状态、完成记录和长期结论。

## 真实 Grok 首批视觉证据

- `shot_007` 的 4 张新候选证明页面化污染已解除：产物均为单幅 2:3 镜头，不含漫画格框或对白气泡。
- 首张真实候选仍出现可读英文 `VENTILATION & MAINTENANCE`，其余候选也含屏幕、白板和文件伪文字，因此不满足严格无文字契约。
- 主要污染源不是权威 Prompt 漂移，而是场景参考资产本身不满足环境底板语义：`scene_05/background.webp` 已含大量文字、人物、文件和具体剧情构图。
- 多图编辑模式会优先保留输入参考的空间和细节，仅追加 negative prompt 无法稳定清除参考图里的文字与无关人物。
- 后续需要给场景参考增加“可作为候选生成环境底板”的显式资格或版本标识；旧/未知场景图默认不注入候选任务，避免错误身份和文字污染。
