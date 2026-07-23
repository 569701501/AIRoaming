---
doc_id: AIR-TASK-20260723-LAYOUT-OCCLUSION-FINDINGS
status: complete
created: 2026-07-23
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 发现

## 需求理解

- 用户要求检查真实漫画成稿预览中的文字遮挡人物问题，并给出根因判断。
- 用户提供的初步判断包含视觉识别未运行、规则气泡内置、质量门误放行和运行时凭据缺失四层原因，本轮逐层核证。

## 已知背景

- 既有重生成任务只保证 11/11 镜头和 19/19 对白/旁白完整，不代表视觉主体避让通过。
- 既有记录显示该章曾出现 `rule_fallback` 和 `visual_analysis_not_configured`；本轮将以当前页面和当前数据库状态重新确认。

## 证据

### 真实页面与 Working Copy

- 当前预览为 Working Copy `layout_wc_080dd45e-7623-4079-a5dc-cd913a9221b7` v66，9 段、11 画格、19 个对白/旁白对象。
- 文档坐标计算得到 7/19 文字对象与来源画格相交：第 1 段 1 个、第 2 段 1 个、第 6 段 1 个、第 9 段 4 个。
- 第 6 段长对白进入画格并压住主角头发；第 9 段三条对白覆盖人物胸腹、手和手机/雨伞区域，底部旁白也进入画格。
- 预览 DOM 与文档坐标按统一比例对应，浏览器控制台无错误，故预览只是忠实显示了错误 Working Copy。
- 可用截图：
  - `evidence/遮挡证据-第2段-真实视口.png`
  - `evidence/遮挡证据-第6段-真实视口.png`
  - `evidence/遮挡证据-第9段-文字密集区.png`

### 最近 5 次任务

| 证据项 | 结果 |
| --- | --- |
| `visualAnalysisProvider` | 5/5 为 null |
| `analysisMode` | 5/5 为 `rule_fallback` |
| 每次分析数 | 11 |
| 每次 `rule_fallback` 数 | 11 |
| 每次 `visual_analysis_not_configured` 数 | 11 |
| 任务状态 | 5/5 `succeeded` |
| 任务分数 | 5/5 为 92.48 |
| `needs_review` | 5/5 为 0 |

### 凭据与来源投影

- 默认文本 Provider `self/grok-4.5` 的公开 `configured=true` 来自指纹存在；DB owner 为 `opencode`，无 `secretRef`。
- 四个图片 Provider 都有 SecretStore 引用，但没有任何一个同时满足与文本 Provider 指纹和 base URL 相同，因此当前进程无法从图片凭据恢复文本 runtime key。
- `LayoutCompositionSourceProjector` 只根据 runtime `apiKey` 判断是否冻结 `visualAnalysisProvider`；当前为空时写 null。
- `LayoutVisualAnalyzerService` 看到 null 后不调用视觉模型，直接为每个 Shot 生成 `rule_fallback + visual_analysis_not_configured`。

### 放置、评分与 hard gate

- 规则 composer 以画格内部上缘作为基础气泡位置；最终 visual composer 即使没有安全区，也无条件加入 5 个画格内候选。
- fallback 契约要求 `subjects/focalRegions/textSafeRegions` 全部为空，因此候选评分没有任何人物、脸、关键动作或安全区证据。
- score 将气泡面积至少 82% 位于来源画格内，或 72px 内对齐，判为“关联正确”。
- 主体遮挡只根据已投影 subjects 检测；subjects 为空时 `subjectOcclusionOk` 保持 true，并拿到完整主体保护分。
- hard gate 不检查 `balloonGeometryOk`、`subjectOcclusionOk`、`cropOk`、`tailOk`、`shapeSafeOk`、总分或 direct-usable rate；因此错误候选仍能成为有效计划。
- 固定语料全 fallback 回放中，多个页漫样例出现气泡大部分进入画格，但仍全部 `hardGatePassed=true`、`subjectCropProtection=25`；有样例 `balloonDirectUsableRate=0.5` 仍通过。

### 测试

- 本轮运行 Shared `visual-analysis`、`visual-composer`：12/12 通过。
- 本轮运行 Server `settings.service`、`layout-visual-analyzer.service`：14/14 通过。
- 当前测试只验证 fallback mode、warning、尾巴关闭、内容覆盖和文字不溢出，没有验证全 fallback 时文字不得进入图片画格或真实主体遮挡。

## Scrutiny Review

- **结论：通过。**
- 凭据状态、任务来源投影、分析输出、布局候选、评分、hard gate、当前 Working Copy 和真实页面形成闭合证据链。
- 用户给出的四层判断全部成立；新增发现是 hard gate 本身没有把已计算出的气泡几何与主体遮挡纳入通过条件。
- 风险：本轮未调用外部视觉模型、未实现修复，也未证明某个具体模型已能在当前 OpenCode runtime 中稳定完成图片结构化分析。

## Runtime/User Review

- **结论：不通过当前视觉质量；通过诊断复现。**
- 当前成稿存在明确可见的人物与关键动作区域遮挡，不满足普通读者视觉验收标准。
- 预览渲染忠实，无前端控制台错误；问题在 Working Copy 生成和质量放行链路，不在预览页。
- 本轮没有改变当前成稿，用户仍可在原链接看到相同 v66。

## 诊断结论与修复顺序

1. **先修安全硬门：** 当任一 Shot 没有可信视觉区域时，对白/旁白不得与图片画格相交；空间不足时增加外部/侧挂文字带或画布高度，而不是退回画格内部。
2. **再修质量门：** 将 `balloonGeometryOk`、`subjectOcclusionOk` 和 direct-usable 最低率纳入 hard gate；无视觉证据时不得把遮挡记为 true，应为不可评估并采用更严格几何约束。
3. **修运行时能力判定：** 不再用公开指纹状态代替当前进程的视觉能力；source projector 应基于可调用的多模态 runtime 能力冻结 Provider，并补齐重启场景测试。
4. **显式呈现降级：** UI 应显示“本次仅规则排版，未进行画面识别”，不能表述为已使用“安全排版规则”且继续给出智能主体避让成功感。
5. **最后重排与验收：** 修复后重新生成当前章节，要求 19 个文字对象对图片画格的交集为 0（无视觉证据模式），并对第 2、6、9 段保留新截图复核。
