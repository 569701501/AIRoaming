---
doc_id: AIR-TASK-20260722-SMART-LAYOUT-M2-VISUAL
status: active
created: 2026-07-22
updated: 2026-07-22
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M2 规则成稿生产 renderer 接触表与原尺寸样例
---

# M2 规则成稿运行与视觉复核

## 1. 复核范围

- 页漫接触表：`contact-sheet-paged.png`。
- 条漫接触表：`contact-sheet-vertical.png`。
- 原尺寸重点样例：`outputs/fix-p04-paged/page-0001.png`、`page-0002.png`、`outputs/fix-v02-vertical/long.png`。
- 运行路径：M2 `LayoutDocumentV2` 临时投影为 V1，进入现有生产 `LayoutRendererService`；没有使用 DOM 截图替代品或第二套 renderer。

## 2. M2 结论

M2 规则内核通过本阶段运行复核：12 个变体均生成真实 PNG；6 个页漫变体同时生成真实 PDF，6 个条漫变体同时生成切片和长图。69 个镜头均有唯一可见画格，59 条对白/旁白均有唯一可编辑气泡，未发现来源文字遗漏、重复、静默改写或矩形文字框 overflow。

该结论只证明“规则模式可以完整、安全地形成基础成稿并进入现有出版链路”，不代表视觉直接可用率达到 80%，也不替代 M3 的两次独立人工评分。

## 3. 可确认的改进

- 条漫已经从固定“一镜一个 1080×1920 段”变为按叙事组形成的可变高度段落，一个段落可容纳多个相关镜头。
- 页漫已按叙事组和 impact/transition 边界形成 1～4 格页面，不再固定每四镜机械切页。
- speech、thought、shout、caption 类型均进入正式 BalloonElement；长对白通过增加气泡高度和减少同页镜头数保持既定字号。
- 无对白章节没有虚构气泡；无法可靠定位人物时所有尾巴保持关闭，未伪造说话者锚点。

## 4. 留给 M3 的明确红灯

1. 规则中心 crop 无法识别边缘人物，部分画格仍切到主体；需要视觉分析的主体框、脸框和安全区。
2. 规则模式没有人物锚点，speech/thought/shout 的尾巴全部关闭；气泡视觉直接可用率尚不能签收。
3. 长对白虽然通过矩形文字测量，但椭圆气泡的曲线安全区不足；原尺寸 `FIX-P04` 可见首尾行压到气泡曲线外。M3 必须加入 shape-safe text bounds，必要时同步校准 renderer 的 padding/verticalAlign 语义。
4. caption 与对白只按保守上缘堆叠，个别页面遮挡主体或显得拥挤；需要视觉安全区、碰撞检查和有限修复。
5. impact/transition 的原子边界会产生少数 1～2 格页面；内容完整但节奏和平衡仍需多候选评分，而不能把“合法”直接当“好看”。
6. 条漫 slow/transition 留白偏保守，长段之间可能过松；需要按整章节奏而非单组固定系数评分。

## 5. 运行中发现并关闭的问题

首次真实条漫渲染在长图拼接处报 `LAYOUT_RENDER_OUTPUT_INVALID:SLICE_STITCH_DIMENSIONS`。原因是 slice plan 对每段高度按物理像素取整，而长图总高度直接累加小数段高，两个总数可能相差一个像素。M2 规则规划器现已把自动生成的 strip section 边界固定为整逻辑像素，第二次运行 12/12 全部成功；未修改 Server renderer，也未降低输出要求。

## 6. 复核判定

| 项目 | 结果 |
| --- | --- |
| M2 内容覆盖与忠实度 | 通过 |
| M2 真实 renderer 可出片 | 通过 |
| M2 规则 fallback 可用 | 通过，带 `visual_analysis_unavailable` warning |
| M3 视觉直接可用率 ≥80% | 未执行，不得提前签收 |
| 双人独立人工复核 | 未开始，留到 M3 候选冻结后执行 |
