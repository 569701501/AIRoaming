# 智能成稿 M0 固定语料

本目录冻结智能成稿首轮开发使用的语义输入和当前 V1 红灯基线。它与 `tests/fixtures/layout/` 的 G5 renderer fixture 分工不同：G5 语料证明既有文档能够确定性渲染；本语料证明智能成稿是否理解分镜、对白、节奏、来源和裁切。

## 语料规模

- 10 个验收组，严格对应 `FIX-V01`～`FIX-X02`。
- 12 个可运行变体：6 个条漫、6 个页漫；`FIX-X01` 和 `FIX-X02` 各自同时覆盖两种格式。
- 69 个 active Shot、59 条对白或旁白来源项。
- 每个变体都包含正式 `StoryboardDocumentV2`、current CandidateLockSet、ready 图片、受控中文字体、预期对白账本和现有 `LayoutDocumentV1`。

## 图片与评分边界

`assets/*.png` 是确定性生成的真实尺寸测量图。白框表示必须保留的主体范围，人物图形用于肉眼识别中心裁切是否切掉主体。它们用于回归布局和裁切，不代表未来视觉模型的美术质量。

现状评分将缺失的必需气泡计为失败；无对白变体的气泡指标记为 `not_applicable`。自动 rubric 只用于冻结红灯和人工调整下限，不能替代最终要求的两次独立人工视觉复核。

## 再生成

```bash
pnpm smart-layout:m0:generate
pnpm smart-layout:m0:render
pnpm test:smart-layout:m0
```

更新 seeds 后必须说明 `corpusDigest` 变化原因。不得为了提高分数删除失败样例，也不得用生成器覆盖人工签收结论。
