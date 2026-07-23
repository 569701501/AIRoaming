---
doc_id: AIR-EVIDENCE-20260722-SMART-LAYOUT-M0-REVIEW
status: active
created: 2026-07-22
updated: 2026-07-22
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 智能成稿 M0 固定语料、生产 renderer 产物与逐张视觉复核
---

# 智能成稿 M0 现状基线复核

## 1. 结论

M0 固定语料和现状红灯基线已完成。

- 冻结 10 个语义组、12 个可运行变体，条漫与页漫各 6 个。
- 覆盖 69 个 active Shot、59 条正式对白或旁白来源项。
- 使用现有 `initializeLayoutCanvasesFromSourcesV1` 生成 V1 现状文档。
- 使用生产 `LayoutRendererService` 和 Chromium 149 生成真实 PNG、PDF、条漫切片与长图。
- 当前画格/裁切直接可用 5/69，约 7.25%；当前必需气泡直接可用 0/59。
- 当前至少需要 52 次布局调整、41 次裁切调整和 59 次文字/气泡创建，共 152 个对象级调整。

结论为 `red`，符合 M0 的目的：证明现有固定模板不能作为“智能成稿”，不能把镜头 100% 放进画布误报成成稿质量合格。

## 2. 证据

| 证据 | 路径 | 说明 |
| --- | --- | --- |
| 固定语料清单 | `tests/fixtures/smart-layout/corpus.manifest.json` | 语料摘要、组/变体、素材和评分规则 |
| 现状聚合报告 | `m0-current-baseline-report.json` | 69 个画格与 59 个文字来源项的红灯统计 |
| 渲染产物清单 | `m0-baseline-output.manifest.json` | renderer 身份、RenderPlan 摘要、产物摘要和尺寸 |
| 页漫接触表 | `contact-sheet-paged.png` | 6 个页漫变体、10 张真实页面 PNG |
| 条漫接触表 | `contact-sheet-vertical.png` | 6 个条漫变体的完整长图 |
| 双人复核模板 | `m0-human-review-template.csv` | 69 个 panel 行 + 59 个 required_balloon 行，不预填人工结论 |
| 完整导出 | `outputs/<variantId>/` | 6 份 PDF、10 张 page PNG、11 张 strip slice、6 张 long PNG |

测量图中的白框是必须完整保留的主体范围。白框被画格边缘截断，就能直接证明中心 cover 裁切损失主体；它不是未来美术效果的替代品。

## 3. 分变体统计

| 变体 | 画格 | 直接可用 | 需改布局 | 需改裁切 | 必需气泡 | 最少调整 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `fix-v01-vertical` | 6 | 0 | 6 | 3 | 6 | 15 |
| `fix-v02-vertical` | 8 | 0 | 8 | 4 | 8 | 20 |
| `fix-v03-vertical` | 7 | 2 | 5 | 2 | 5 | 12 |
| `fix-v04-vertical` | 8 | 0 | 7 | 4 | 8 | 19 |
| `fix-p01-paged` | 6 | 0 | 6 | 4 | 6 | 16 |
| `fix-p02-paged` | 5 | 0 | 1 | 5 | 7 | 13 |
| `fix-p03-paged` | 7 | 0 | 7 | 3 | 3 | 13 |
| `fix-p04-paged` | 4 | 0 | 4 | 4 | 8 | 16 |
| `fix-x01-vertical` | 5 | 0 | 4 | 3 | 0 | 7 |
| `fix-x01-paged` | 5 | 1 | 1 | 4 | 0 | 5 |
| `fix-x02-vertical` | 4 | 1 | 3 | 2 | 4 | 9 |
| `fix-x02-paged` | 4 | 1 | 0 | 3 | 4 | 7 |
| **合计** | **69** | **5** | **52** | **41** | **59** | **152** |

## 4. 逐张视觉观察

### 页漫

- 固定每 4 镜分组，无法服从对话交换、动作高潮和长对白的叙事边界。
- 余数为 1 或 2 时，尾页镜头被机械放成整页或两个极窄竖格，和镜头作用无关。
- 横向环境、多人对峙和边缘双人构图被塞入窄竖格，主体白框明显被切断。
- `FIX-P04` 有长对白和旁白，但页面只有底图，没有任何文字对象，也没有为文字留出版面。
- `FIX-X01` 证明无对白章节不会凭空产生气泡，但这只能算“没有虚假内容”，不能证明节奏布局合格。

### 条漫

- 每个镜头都固定占一个 1080×1920 段落，所有镜头的视觉重量近似相同。
- atmosphere、detail、transition、reaction 和 impact 没有不同的留白、尺寸或节奏。
- 横向环境与边缘双人图被统一塞入窄竖框，主体或环境安全区被大量裁掉。
- 6～8 镜样例直接形成 9,600～15,360 px 长图，但长度只来自重复大段，不来自叙事节奏。
- 所有对白、独白、喊叫和旁白均缺失，因此当前长图不是可阅读漫画成稿。

## 5. 评分方法冻结

画格直接可用必须同时满足：

```text
layout_ok
&& crop_ok
&& reading_order_ok
&& subject_occlusion_ok
```

必需气泡直接可用必须同时满足：

```text
balloon_geometry_ok
&& balloon_type_ok
&& text_fit_ok
```

规则：

- 缺失的必需对白/旁白按气泡失败计入，不允许从分母删除。
- 无对白样例的气泡指标为 `not_applicable`，但仍参与画格/裁切指标。
- 每个画格、每条来源文字独立计数，不能用“章节看起来还行”覆盖失败项。
- 分歧项只能记录原因，不能从 corpus 删除。
- 未来打开 feature gate 前，必须复制 `m0-human-review-template.csv` 完成两次相互独立的人工复核。

## 6. 复核边界

- 本次已完成 Codex 逐张视觉复核，确认接触表与自动 rubric 的红灯方向一致。
- `m0-current-baseline-report.json` 是可再生成的机械报告，故有意保留 `pending_contact_sheet_review`，不把脚本执行冒充人工审阅；本文件记录实际视觉复核结论。
- 独立人工复核当前为 0/2。它是未来验证“智能成稿达到 ≥80%”的发布门，不是确认现状明显低于门槛的前置条件。
- 合成测量图可证明几何、裁切、覆盖与导出合同，不能证明真实漫画美术质量；M3 仍需加入真实定稿图 shadow 复核。
