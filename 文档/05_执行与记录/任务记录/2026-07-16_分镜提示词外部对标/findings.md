---
doc_id: AIR-TASK-20260716-STORYBOARD-PROMPT-BENCHMARK-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 当前代码、项目文档和公开外部来源
---

# 分镜提示词外部对标发现

## 当前基线

- AI漫游不是从零生成“漂亮镜头描述”，而是把已确认 StoryStructure 拆成可编辑、可追溯的 Shot；beat、scene、character 引用和正式版本链是不能从外部模板中丢失的核心优势。
- 当前 Prompt 已包含单帧可画、连续性、漫画阅读、镜头语法、气泡安全区、视觉变化、comic/motion 一致与精简 `promptDraft`。
- 当前不足更可能是规则仍偏一句话，缺少可操作的镜头决策顺序、面向漫画的转场分类、场面覆盖策略和连续性账本，而不是字段数量不够。

## 外部来源

- `StoryDiffusion` 热度最高，但它解决的是长序列角色一致性，不是文本拆镜；可借鉴角色锚点和逐镜描述分离，不能把它包装成分镜 Prompt 来源。
- `AI Comic Factory` 公开了真实系统 Prompt，核心是固定画格数下输出 drawing instructions / speech / caption，并带入 previous panels；它的结构化程度、引用和质量门均弱于当前项目，只适合证明画面、对白和旁白应分开。
- `Seedance2-Storyboard-Generator` 公开了完整 Skill 和案例，尾帧到首帧、资产作用说明和生成后完整性审查值得吸收；黄金三秒、固定 15 秒、3 秒分段、9:16、视频延长和音效属于短视频生产，不进入通用漫画分镜。
- `story-shot-agent` 公开了解析、拆镜、Prompt 转换和质量审计四组 Prompt；其模块化、问题代码和修复建议值得借鉴，固定秒数、音频、负面 Prompt、provider 技术参数和宽→中→近通用公式不采用。
- `AI-storyboard-generator` 的实际代码把静态关键帧与相邻图之间的 motion Prompt 分开，并明确检查动作完成、朝向和场景过渡；热度低，只作为“状态接力”方法旁证。
- `Tapnow-Studio-PP` 有较丰富的分镜工作台字段和多入口，但默认拆镜 Prompt 本身很短，说明产品热度、字段数量和 Prompt 质量不能混为一谈。
- Boords 官方产品文档证明导入脚本、AI 创作和空白入口可以汇入同一故事板，但没有公开内部系统 Prompt，只能作为流程证据。
- Runway 官方指南强调单条视频 Prompt 聚焦一个动作、先写镜头信息、减少无用技术细节；只适用于 motion 与下游图片/视频 Prompt，不反向要求漫画画格固定秒数或必须运镜。
- Promptfoo 的确定性 assertion 和模型 rubric 分层适合 P6；模型评分不得替代后端硬门和用户确认。

### GitHub 读取快照

| 仓库 | 读取 commit | 2026-07-16 热度快照 |
| --- | --- | ---: |
| `HVision-NKU/StoryDiffusion` | `8de45e4` | 6,441 stars |
| `liangdabiao/Seedance2-Storyboard-Generator` | `17b9ca6` | 1,826 stars |
| `jbilcke-hf/ai-comic-factory` | `c5dc3c7` | 1,337 stars，已归档 |
| `chapterv/Tapnow-Studio-PP` | `a01e89f` | 535 stars |
| `neopen/story-shot-agent` | `6b31129` | 120 stars |
| `aicontentskills/ai-video-storyboard-skill` | `93f8a6d` | 24 stars |
| `dseditor/AI-storyboard-generator` | `40ca3ea` | 16 stars |

## 适配结论

- 当前 Prompt 骨架应保留；外部开源模板整体上没有超过当前项目的事实源、引用、版本和确认边界。
- V2 不增加输出字段，新增的是内部 beat 覆盖计划、复杂度镜头预算、镜头用途、状态接力、漫画镜头模式和删除检查。
- 当前 `beatCount` 到 `beatCount * 2` 的宽泛数量建议应改为“每 beat 一个主镜，满足明确复杂条件才增加辅助镜”，以降低模型把所有 beat 都拆到上限的倾向。
- 应把现有 `project.comicFormat` 和 `project.artStyle` 注入分镜 Prompt；它们已经存在，不会影响页面字段。
- 黄金钩子只允许视觉化 `direction.endingHook` 和末尾 beat 已有事实，不得在分镜阶段创造新线索、反转或对白。
- 连续性应从一句总要求改成内部账本：位置/朝向、视线、手持道具、道具状态、服装伤势、时间天气光线和动作完成状态。
- `comic` 先确定静态决定性瞬间，`motion` 再从同一事实投影一个主体动作和最多一个主要运镜；`static / none` 是正常选择。
- V2 先做同模型 A/B 和固定样例验证，再决定是否替换生产默认。
