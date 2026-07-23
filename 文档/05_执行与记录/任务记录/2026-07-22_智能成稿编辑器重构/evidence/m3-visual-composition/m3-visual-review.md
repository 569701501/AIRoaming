---
doc_id: AIR-TASK-20260722-SMART-LAYOUT-M3-VISUAL-REVIEW
status: active
created: 2026-07-22
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M3 生产 renderer 视觉产物
---

# M3 视觉复核

## 1. 当前结论

M3 已生成完整生产 renderer 产物并完成 Agent 接触表与代表性原尺寸复核。自动预检达到画格 `69/69（100%）`、必需气泡 `59/59（100%）`；内容保持 `69/69` 镜头、`59/59` 对白/旁白，`0` 静默改写、`0` 文字溢出。

当前结论为 `passed_automated_prescreen_human_review_pending`，不是 M3 最终通过。两份独立人工评分表仍为空白，不能用 Agent 复核或自动分替代。

## 2. 证据身份

| 项目 | 值 |
| --- | --- |
| Corpus | 10 组 / 12 变体 / 69 镜 / 59 文字项 |
| 输出 manifest | `m3-visual-output.manifest.json` |
| Manifest digest | `sha256:858d8d7862497001d8d8e7258ca84963909c3aef685e3665fd13b825f7edf84b` |
| Renderer | `chromium-149-layout-v1` / Chromium `149.0.7827.55` |
| 真实产物 | 42 个 canvas、18 张页漫 PNG、6 份 PDF、条漫切片与 6 张长图 |
| 汇总视图 | `contact-sheet-paged.png`、`contact-sheet-vertical.png` |
| 自动逐对象表 | `m3-automated-review.csv` |
| 独立人工表 | `m3-human-review-round-a.csv`、`m3-human-review-round-b.csv` |
| 独立盲评页面 | `m3-human-review-round-a.html`、`m3-human-review-round-b.html` |
| 结果校验命令 | `pnpm smart-layout:m3:review:validate` |

## 3. 强制复核口径

- 画格：布局、主体/人脸裁切、阅读顺序、气泡遮挡均无需调整才算直接可用。
- 必需气泡：位置与尺寸、类型、阅读路径、文字适配、shape-safe 内区和尾巴语义均无需调整才算直接可用。
- 每轮人工复核必须独立填写对应 CSV，不读取另一轮结果；两项直接可用率均达到 80% 才能关闭 M3。
- A/B 页面默认 128 项全部未判断，不显示自动评分；两轮使用独立本地存储，不能复制另一轮结果。
- 选择“需要调整”时必须勾选至少一个原因并填写说明；未完成全部对象、未填写评审人或未确认独立复核时不能导出。
- 导出后的 A/B CSV 必须覆盖本目录对应空白表，再运行校验命令。校验器会拒绝同一评审人、来源字段/对象身份被修改、错误轮次、非法布尔值、缺少调整说明或任一项低于 80% 的结果。

## 4. Agent 视觉复核

已检查全部页漫与条漫接触表，并在原尺寸检查以下代表性和失败样例：

- `FIX-V01` 长条漫：caption、speech、thought 的形状、文字内区、主体裁切和长图连续性正常。
- `FIX-P01 page 2`：focus pair、上下外置气泡和 shout 尾巴可读，主体未被裁掉。
- `FIX-P02 page 1`：多人密集页改用居中的双人 sidecar；短对白/喊话按文字自适应宽度，四个气泡均未遮挡人物或互穿尾巴，指向正确说话人。
- `FIX-P03 page 3`：三格节奏、无对白画格与绑定对白顺序正常。
- `FIX-P04 page 2`：长对白保留在画格上方，caption 落在本画格底部安全区；下方双人问答气泡分置两侧，尾巴分别指向正确人物。
- `FIX-P04 page 3`：对白位于画格上方，caption 贴在本画格底部，二者与主体均不相撞且来源关系清楚。

检查中累计发现并已修正四类问题：图片 cover 的显示尺寸曾与 Shared/Web 裁切矩阵不一致；生产 renderer 曾使用自有 CSS 气泡和固定三角尾巴；短对白曾无条件占满画格宽度；无尾巴 caption 曾为避让尾巴而漂离来源画格。当前 renderer 按素材实尺寸执行同一 cover 计算并使用 Shared `balloon_shape_v1` 路径；规划器按文字长度收缩 speech/shout，并把无尾巴文字与来源画格的视觉关联作为硬约束。

## 5. 自动预检明细

| 指标 | 总体 | 条漫 | 页漫 |
| --- | ---: | ---: | ---: |
| 画格直接可用 | 69/69（100%） | 38/38（100%） | 31/31（100%） |
| 气泡直接可用 | 59/59（100%） | 31/31（100%） | 28/28（100%） |
| 主体与人脸裁切通过 | 69/69（100%） | 38/38 | 31/31 |
| 主体不被气泡遮挡 | 69/69（100%） | 38/38 | 31/31 |
| shape-safe 内区 | 59/59（100%） | 31/31 | 28/28 |
| 尾巴语义与路径 | 59/59（100%） | 31/31 | 28/28 |

上一版自动失败集中在 `FIX-P02` 多人密集页与 `FIX-P04` 单格长对白页。本版已用通用的 sidecar、短文本自适应气泡与来源画格关联规则修复，未删除任何样例或对象，也未由生成脚本自动填写人工表。连续两次独立生成得到同一 manifest digest。

## 6. 复核状态

- 生产 renderer：已运行并通过产物合同。
- Agent 原尺寸/接触表复核：已完成；仅作为工程复核。
- A/B 独立盲评页面与 fail-closed CSV 校验器：已完成并通过真实 Chromium 回归；页面仍保持默认空白。
- 独立人工复核 A：未执行。
- 独立人工复核 B：未执行。
- M3 release gate：未关闭。

## 7. 下一步

由两位互不查看对方结果的复核人分别打开 A/B HTML；评审人应重点复查 `FIX-P02 page 1` 的多人对白、`FIX-P04 page 2/3` 的长对白与 caption 归属，同时逐项检查是否存在机器 rubric 未捕捉的阅读问题。完成后将导出的同名 CSV 放回本目录并运行 `pnpm smart-layout:m3:review:validate`。只有校验结果为 `passed`，才可把 M3 标记 complete 并进入 M4 持久任务。
