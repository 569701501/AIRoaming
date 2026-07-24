---
doc_id: AIR-TASK-20260724-MANGA-EDITOR-RUNTIME
status: passed_with_observations
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、handoff.md、关键 DB E2E、Web 可执行合同与运行截图
---

# Runtime / User Review

## 结论

`PASS（with observations）`。

本轮在隔离的 DB-only Playwright 环境中复跑了专业成稿关键用户路径，最终结果如下：

- V2 来源覆盖、Undo/Redo、warning、并发门禁、Revision、Publication、sealed sources、桌面/手机与历史恢复/replay 的最终合并路径：`1/1 passed (25.6s)`。
- warning 未确认门禁、受控字体、富文本、四类气泡与选择模式拖动：修正旧 E2E 漂移后 `1/1 passed`。
- 来源失效/缺失时出版 fail-closed：`1/1 passed`。
- Pending 权威预览、Konva 边界和命令批合同：`15/15 + 6/6 passed`。

没有发现阻止本次专业编辑链路交付的运行问题。测试图片服务只提供真实的 `1×1 PNG`，因此截图能证明状态、交互、渲染接线和产物可读，不能替代真实漫画素材上的美术质量验收。

## 环境

- 日期：2026-07-24。
- 浏览器：Playwright Chromium，桌面视口 `1280×720`，手机视口 `390×844`。
- 持久化：仓库规定的 `db` E2E 矩阵；每次运行使用隔离 SQLite、真实 migration、HTTP API、Prisma 和 publication worker。
- 图片提供方：本地 fake provider，经真实 HTTP 返回 `1×1 PNG`；未 mock 页面路由或直接伪造业务响应。
- 数据范围：仅隔离测试项目和测试数据库；未连接生产数据。

## 执行结果

| 验证 | 最终结果 | 说明 |
| --- | --- | --- |
| 专业成稿 V2 最终合并路径 | `1 passed (25.6s)` | run `g0-19334-mrxsatce-453d6c7c`；来源替换、并发门禁、双摘要、sealed sources、出版、恢复/replay、桌面/手机 |
| 智能成稿整章/选中范围 | `passed` | Pending 权威预览与 Konva 命中/选择范围路径 |
| `G4-F` 来源门禁 | `passed` | 同一 DB E2E 运行中通过；验证 stale/missing 来源禁止出版 |
| `G5-M5` warning、字体、富文本、气泡、拖动 | `1 passed (17.7s)` | 最终 run `g0-25678-mrxryck8-cd7d2b0e` |
| Web 静态可执行合同 | `15/15 passed` | Pending 门禁、正式发布流、Konva 私有状态边界、Undo/Redo |
| Konva adapter / P2 可执行合同 | `6/6 passed` | DPR、Transformer 归一化、多选批、气泡尾巴、缩放锚点、SFX/气泡预设 |

首轮直接调用 Playwright 时误用了默认 `file` 模式，被 `G2_DB_MODE_REQUIRED` 正确拒绝；该结果属于无效测试调用，不计入功能结论。随后全部有效浏览器验证均通过仓库的 `--mode=db` 矩阵执行。

## 用户路径

| 路径 | 预期 | 结果 | 证据 |
| --- | --- | --- | --- |
| 无 warning 保存并出版 | Revision 与 Publication 成功 | PASS | `G4-F` 创建 Revision、出版并轮询到 `ready` |
| warning 未确认/已确认 | 先阻断，确认后通过 | PASS | `G5-M5` 断言“还需确认 1 项警告”禁用；V2 E2E 勾选 warning 后保存 Revision 并出版 |
| error | 禁止 Revision/Publication | PASS | `G4-F` 断言“存在阻断”“图片仍引用旧定稿”，正式出版按钮禁用 |
| 预检后摘要并发变化 | 旧确认失效 | PASS（自动化合同） | Web 合同验证 document/source/profile/issues identity 变化会清空确认与 request id；本轮未另做人工并发截图 |
| stale 来源恢复 | 预览全部 appearance、提交、重预检、新 Revision | PASS | V2 E2E 覆盖“候选定稿已变化”→“预览全部”→“确认提交替换”→重新预检→Revision |
| 历史 Revision 恢复 | 修改草稿后恢复不可变 V2，重复旧请求精确 replay | PASS | 页面确认“恢复到草稿”；Working Copy 完整摘要、automation、`basedOnRevisionId` 精确恢复；相同旧期望返回 `result=replayed`，当前 Revision 指针不变 |
| Pending 展开预览 | 采用前看到权威视觉 | PASS | 采用前先展开 `layout-authoritative-pending-preview`，展开后“使用这版新排法”才启用 |
| 手机只读 | 读取正式出版且不提供编辑入口 | PASS | `390×844` 加载 `source=publication&id=...`；画布与图片可见，编辑按钮数为 0 |
| Konva 编辑 | 命中、选择与提交落到正式命令 | PASS | E2E 在 Konva 层按画格中心点击后出现“选中内容智能调整”“选中范围”；M5 选择模式拖动后持久 transform 改变 |
| P2 编辑 | 气泡、富文本、SFX、图层能力不越过 V2 | PASS（分层证据） | 浏览器覆盖富文本、竖排、四类气泡、尾巴和拖动；SFX、气泡预设、色对与批命令由可执行合同覆盖 |

## V2 主链路复核

1. 候选定稿替换后页面出现“候选定稿已变化”。
2. “预览全部”显示“不会改写旧版本”，显式提交后显示“当前定稿”。
3. 来源替换只形成一条历史：Undo 后再次 stale，Redo 后恢复 current；最终 Working Copy digest 与替换完成时一致。
4. 成稿预检显示“智能成稿沿用了人工确认的来源覆盖”；确认 warning 后保存不可变 Revision。
5. Revision API 和数据库均保存 `schema_version=2`，且 `revisionDocumentDigest`、`visibleDocumentDigest` 与独立重算一致。
6. 出版预检再次显示来源覆盖 warning；确认后提交 publication task 并轮询到 `ready`。
7. 页面断言“出版 1 · 已完成”“当前成品”；Publication V2 manifest 的双摘要与 Revision 一致。
8. 另存一份摘要不同的 V2 草稿后，页面确认“恢复到草稿”；Working Copy 恢复为当前不可变 Revision 的完整摘要、automation 和 `basedOnRevisionId`。
9. 使用恢复前的相同旧期望重复请求返回 `result=replayed`，且 `currentLayoutRevisionId` 保持不变。
10. 手机路由读取该 Publication，显示“出版 1 · 已完成 · 当前”，画布数量等于正式文档画布数量，且无编辑按钮。

## 截图证据

| 路径 | 可见内容 |
| --- | --- |
| `文档/05_执行与记录/任务记录/2026-07-24_漫画成稿专业编辑实施/evidence/v2来源覆盖与正式出版.png` | “正式出版”“需要确认”“智能成稿沿用了人工确认的来源覆盖”“开始正式出版”“出版 1 · 已完成” |
| `文档/05_执行与记录/任务记录/2026-07-24_漫画成稿专业编辑实施/evidence/v2手机出版预览.png` | “只读预览”“出版 1 · 已完成 · 当前”“条漫连续预览”“正式出版产物”以及三个 artifact role |
| `文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m5-workspace/整章新排法对比.png` | “收起完整视觉预览”“当前完整视觉 / 当前”“新排法完整视觉 / 待应用” |
| `文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m6-workspace/条漫选中画格智能调整预览.png` | 选中范围生成后的当前/新排法权威视觉对比 |
| `文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence/g5_m5_text_balloon_fonts.png` | “成稿预检”“需要确认”“文字发生溢出”未勾选状态 |
| `文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence/g4_f_layout_stale.png` | “候选定稿已变化”“存在阻断”“图片仍引用旧定稿”，出版按钮禁用 |

## 产物检查

- Publication 状态：`ready`。
- 页面完成态：“出版 1 · 已完成”“当前成品”。
- Artifact roles：
  - `long_png`
  - `publication_manifest`
  - `strip_slice_png`
- Manifest：`schemaVersion=2`、`kind=layout_publication_manifest_v2`，双摘要与正式 Revision 一致。
- 数据库：`layout_revisions` 和 `export_revisions` 的 schema 版本、完整摘要、可见摘要均与独立重算一致。
- 手机出版预览：正式图片节点真实可见，非空壳卡片；无编辑按钮。
- 浏览器运行：关键用例 `pageerror=[]`。

## 复跑中发现并关闭的 E2E 漂移

运行复核曾连续暴露三处旧 M5 用例假设，均由实现侧修正后通过最终复跑：

1. 受控字体已从 `400/700` 扩展为 `400/500/700/900`，旧用例仍断言 2 个字体、Asset 和 Outbox。
2. 当前受控字体没有 italic face，产品正确禁用“斜体”；旧用例不应要求浏览器合成斜体。
3. 新增“智能调整”后，其 title 含“选择”字样；旧 `getByTitle("选择")` 需改为精确定位。

这些是测试期望/定位器漂移，不是最终运行缺陷；最终 M5 单例已 `1/1 passed`。

## 残留观察

1. **视觉素材代表性有限。** 1×1 fixture 导致桌面/手机出版画布大部分为空白，只能证明渲染和出版链路，不足以评价 crop、rotation、flip、富文本、气泡尾巴在复杂真实漫画上的最终观感。
2. **Pending 门禁验证的是“已展开”。** 当前用户展开完整视觉区后立即视为已查看；尚未等待所有图片/字体加载成功，也不要求滚动浏览到底。它满足本轮“应用前必须展开”的验收，但仍可增加 render-ready/错误态门禁。
3. **截图受工作台内部布局裁切。** 桌面出版图能看到“出版 1 · 已完成”，但“当前成品”主要由 DOM 断言保证；后续可增加只截出版历史卡片的证据。
4. **成功用例出现一次 `ERR_STREAM_PREMATURE_CLOSE` 服务日志。** 页面无异常、任务与产物均为 ready，未影响本轮结论；建议后续降低已取消图片流造成的错误日志噪声。
5. **P2 并非每个控件都有独立浏览器截图。** SFX 预设、保留色对与多选批命令已有可执行合同，但后续可增加真实保存→刷新→恢复的 UI E2E。

## 最终判断

专业成稿的核心真实用户闭环、正负门禁、V2 历史恢复与 replay、Pending 权威预览、Konva 命中和手机正式出版均通过运行复核，可进入交付收口。上述观察属于后续证据与 UX 加固项，不构成本轮发布阻断。
