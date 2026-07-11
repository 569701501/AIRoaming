---
doc_id: AIR-TASK-20260710-D4D5-EDITOR-FINDINGS
status: completed
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 研究发现：D4/D5 高自由成稿编辑器规划

## 1. 需求理解

- D4 与 D5 合并研究：文字、气泡、画格、图片对象和画布操作共同决定编辑文档与渲染器，不能分开各做一套状态。
- 用户已选择高自由方向，但明确要求首期只支持基础、主要能力并参考市场主流做法。
- 本轮先研究与讨论，文档完整后才进入开发。

## 2. 当前代码事实

| 事实 | 证据 | 影响 |
| --- | --- | --- |
| 排版页不是编辑器 | `LayoutExportWorkspace.vue` | 只有预览卡片和两个动作，没有选中、拖拽、属性编辑或保存命令 |
| Layout 固定一镜一页 | `LayoutExportService.buildPages` | 多格、条漫节奏和自由编排尚未存在 |
| 导出复制源图 | `LayoutExportService.exportChapterLayout` | 文字、气泡、裁切和多对象无法进入正式产物 |
| Placement 数据极简 | `packages/shared/src/dto.ts` | 需要新的稳定对象 ID、变换、裁切、层级和来源关系 |
| 没有画布/渲染依赖 | 各 package.json、pnpm-lock.yaml | 技术内核尚未被历史依赖锁死，可先按领域文档选型 |
| D1 已固定两个容器 | ADR-0009 | 同一编辑文档必须适配竖向条漫与分页漫画，四格只是模板 |
| D3 要求不可变修订和 stale | ADR-0010 | 画布不能直接改候选或覆盖旧导出；每个图像对象必须保存来源修订 |

## 3. 初步术语

| 用户术语 | 暂定领域术语 | 说明 |
| --- | --- | --- |
| 高自由画布 | 成稿编辑器 | 服务漫画成品，不等于无限白板或绘画软件 |
| 格子/分格 | 画格 `PanelFrame` | 页面或条漫容器内的视觉裁切与阅读单元 |
| 图片 | 图像对象 `ImageElement` | 可位于画格内，也可作为自由叠加对象 |
| 文字 | 文字对象 `TextElement` | 对白、旁白、标题、拟声字的可编辑文字层 |
| 气泡 | 气泡对象 `BalloonElement` | 形状、尾巴和内部文字的组合对象 |
| 页面/条漫 | 成稿容器 `LayoutCanvas` | 由 comicFormat 决定分页或连续滚动语义 |

术语仍为提议，需结合市场研究和用户逐项确认后写入正式事实源。

## 4. Web Search

### 4.1 专业漫画工具

- Clip Studio Paint 把画格实现为带裁切/蒙版语义的容器，支持模板、切分、gutter、吸附和变换；气泡与尾巴可编辑；文字支持文本框换行、竖排与 ruby；条漫支持手机预览和切片导出。
  - https://help.clip-studio.com/en-us/manual_en/540_comic/Frames_and_Panels.htm
  - https://help.clip-studio.com/en-us/manual_en/540_comic/Balloons.htm
  - https://help.clip-studio.com/en-us/manual_en/480_text/Text_settings.htm
  - https://help.clip-studio.com/en-us/manual_en/480_text/Vertical_text_and_readings.htm
  - https://help.clip-studio.com/en-us/manual_en/540_comic/Webtoons.htm
  - https://help.clip-studio.com/en-us/manual_en/570_pages/Exporting_multi-page_projects.htm
- MediBang 用 Panel Material/Divide 创建画格，文字和气泡保持可编辑分层，并提供常用气泡语义、文字间距/描边/旋转/竖排和云字体。
  - https://medibangpaint.com/en/tutorial/pc/create-comics/
  - https://medibangpaint.com/en/use/2021/11/mangatutorialforbeginners08/
  - https://medibangpaint.com/en/use/2023/11/protext/

### 4.2 AI 漫画工作台

- Dashtoon 公开展示可编辑 panel、可平移缩放工作区、左工具/右属性、画格预设、气泡形状、曲线尾巴和气泡连接。
  - https://insiders.dashtoon.com/dashtoon-studio-august-2024-release/
- Anifusion 把 Comic Creator 与 Infinite Canvas 分成不同工具；漫画工具公开展示模板、自定义布局、重叠、可编辑文字/气泡/尾巴、条漫手机预览和平台化切片。这些属官方营销声明，不用作稳定性证据。
  - https://anifusion.ai/all-features/
  - https://anifusion.ai/features/ai-comic-creator/
  - https://anifusion.ai/features/ai-webtoon-creator/
- LlamaGen 发布记录展示气泡/字体编辑、脚本智能导入、历史、批量重画、跨页画格管理、批量 caption 和导出预览/ZIP。
  - https://llamagen.ai/releases

### 4.3 轻量设计编辑器

- Canva 主打模板起步、拖放重排画格/气泡，图片进入网格后先 fit，再进入 crop 平移与缩放。
  - https://www.canva.com/create/comic-strips/
  - https://www.canva.com/features/design-grid/
- Adobe Express 以模板或 AI 初稿起步，提供改写气泡、重生成单格、换图和编辑标题等少量高频动作。
  - https://www.adobe.com/express/create/comic-strip

### 4.4 可吸收结论

- 市场共性不是“任意节点或无限白板”，而是模板先行、画格裁切容器、非破坏图像裁切、可编辑文字/气泡、就地属性和导出前检查。
- AI漫游应使用条漫/页漫的有限成稿容器，在容器内给对象高自由，而不是首版就变成专业矢量或绘画工具。

## 5. 风险

- 把“高自由”误解为 Photoshop/无限白板，会让首版失去交付闭环。
- 只做前端拖拽而没有确定性渲染器，会造成预览与导出不一致。
- 文字和气泡若各自独立随意变换，自动换行、内边距、尾巴和缩放语义会失控。
- 条漫与页漫若建立两套文档模型，后续维护、模板和导出会重复建设。

## 5.1 已确认决策

- D45-1 已选 A：对象高自由，V1 画格轮廓受控。
- 画格使用矩形/圆角矩形，支持移动、缩放、旋转、重叠和层级调整。
- 动态效果优先用画格变换、画格重叠、边框显隐与自由图片对象实现。
- 梯形、斜切、任意多边形和贝塞尔节点后置，不扩大 V1 命中、裁切与渲染测试矩阵。
- D45-2 已选 C：横向/竖向文字与同一文字框逐字富文本进入 V1。
- D1 的竖向条漫/分页漫画控制成品容器；D45-2 的 `horizontal-tb/vertical-rl` 控制文字书写方向，二者不冲突。
- 富文本正式模型使用 `RichTextDocument -> paragraphs[] -> runs[]`；气泡内文字复用同一引擎。
- `ruby`/注音、沿路径文字、透视/弧形变形、逐字自由位置/旋转仍然后置，不随 C 一并扩张。
- D45-3 已选 A：气泡使用 `speech/thought/shout/caption` 四类受控轮廓和最多一条可调尾巴。
- 气泡的高自由落在整体移动/缩放/旋转、层级、填充、描边、内边距、透明度和 D45-2 富文本，不落在任意轮廓节点。
- 多气泡连接/合并、多尾巴、布尔运算、自动避让和自动指向不进入 V1。
- D45-4 已选 A：多选关系是编辑会话内的 `SelectionSet`，不是正式 `LayoutElement`。
- 批量变换以临时选择包围框为枢轴，将结果回写每个对象；批量动作作为一个 Editor Command 撤销/重做。
- 气泡内部、画格与图片所属等领域关系仍持久保存；“不保存 Group”只针对用户任意组合的一般对象。
- D45-5 已选 A：桌面浏览器是 V1 正式编辑环境；手机只读预览已保存草稿快照或 LayoutRevision，不调用编辑/保存/导出确认 API。
- 手机必须使用同一 `LayoutDocument`、字体资产和渲染规则展示条漫滚动/页漫翻页、手机可视窗口、切片边界与预检问题，不另建近似版。
- D45-6 已选 A：成稿步骤保留 AI 助手，但进入编辑器时默认收起为可展开抽屉，并继续使用该步骤独立对话上下文。
- AI 建议必须先形成带来源 digest、影响摘要和预览差异的 `PendingEditorCommandSet`；应用后才成为可撤销 Editor Command，AI 无权自动建立正式修订或确认导出。

## 6. Scrutiny Review

结论：D4/D5 首版范围静态方案通过并由 ADR-0011 采纳；它是后续开发文档的产品与契约输入，不构成功能开发授权。

- 市场事实的证据类型已分级，没有把官方营销表述扩大为稳定性、性能或易用性结论。
- 方案不改变 ADR-0009 的条漫/页漫身份，也不改变 ADR-0010 的定稿修订、stale 与不可变导出约束。
- 首版边界覆盖真实成稿必要动作，且已明确排除逐像素绘画、画布内 inpaint、视频时间线和专业印刷包。
- D45-1 至 D45-6 已确认为 A/C/A/A/A/A，方案、ADR、全项目基线和任务记录相互一致。
- D45-2=C 是首版最大技术风险，后续 E0 原型必须先验证中日文 IME、横竖排、字符范围富文本和浏览器/服务端黄金渲染一致性。

## 7. Runtime/User Review

本轮无功能代码，编辑器真实用户路径运行验证不适用。用户已完成 D45-1 至 D45-6 的逐项确认；配套决策页已验证加载、切换、六项已确认状态与窄屏无横向溢出。
