---
doc_id: AIR-TASK-G5-FINDINGS-001
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent
source: G5 代码库、正式文档与候选技术探索
---

# 事实发现

## 已确认边界

- ADR-0011 已采纳“有限正式成稿容器 + 高自由对象编排”；项目容器只有 `vertical_scroll/paged_comic`。
- V1 画格只做矩形/圆角矩形；文字同时支持 `horizontal-tb/vertical-rl` 和字符范围富文本；气泡为四类预设 + 单尾巴。
- 一般多选只属于会话，不保存通用 Group；桌面完整编辑、手机只读预览；成稿 AI 助手默认收起。
- G1 已规划 `LayoutWorkingCopy/LayoutRevision/LayoutSourceBinding/ExportRevision/ExportArtifact`，G5 应细化而非另建平行事实源。
- G4 已确认候选定稿修订、lock set digest 和派生 `current/stale/unresolved`；G5 负责逐格/批量解决 stale。
- G6 单独负责素材 ZIP 和下载包；G5 只交付真实出版 PNG、分页可选 PDF 与条漫切片。

## 当前代码现状

- `LayoutExportWorkspace.vue` 只有章节选择、生成排版、导出 PNG 序列和卡片网格，仍读取 `shot.lockedCandidateId`。
- `LayoutExportService` 按一镜一页生成旧 `ChapterLayout V1`，正式导出只复制每页第一张候选源图；没有合成、富文本、气泡、裁切、版本或预检。
- Shared 的 `PanelPlacement/LayoutPage/ChapterLayout` 没有稳定元素 ID、来源定稿修订、crop、文字、气泡和命令。
- Web 和 Server 均未安装画布交互、富文本、PNG 合成或 PDF 渲染依赖；当前不能把现有依赖误写为已选技术。
- 项目工作台固定为左侧对话 + 右侧业务区；G5 需要只对 `layout_export` 步骤切换为全宽画布和默认收起抽屉。
- 当前导出为同步调用，但 G1 已规划持久 `layout_export` task；G5 正式渲染必须消费该任务底座。
- 项目没有受控 FontAsset；G5 应复用通用 `Asset`，增加 `type=font/role=layout_font` 的 metadata codec，而不是新增第 45 个数据库模型。

## 技术资料结论

- Konva 官方 Vue 指南建议应用状态保存在 Vue/业务状态中，不序列化 Konva 节点；这支持“交互内核是 adapter，LayoutDocument 才是事实源”。
- CSS Writing Modes Level 3 正式定义了 `vertical-rl` 与 `text-orientation`，但竖排混排、标点与具体字体仍需黄金样例验证。
- Playwright 每个版本绑定特定浏览器二进制，并支持精确尺寸截图和 PDF；固定版本 Chromium 可作为“独立渲染场景”的候选栅格器。
- `resvg-js` 可用自带/指定字体把 SVG 转为 PNG，并能关闭系统字体；它是确定性较强的对照路线，但完整竖排富文本若需显式字形定位，开发成本更高。
- Fabric/Konva 的文本或序列化能力不足以自动证明服务端一致性；任何候选编辑内核都必须通过 E0，而不是靠功能列表选型。

## 关键设计收口方向

- LayoutDocument 使用业务 schema；编辑器节点、HTML、选区、视口和 Undo 栈不持久化。
- PanelFrame 与所属图片形成受控复合关系，避免图片图层与边框图层漂移；自由图片仍是独立顶层元素。
- 数字在命令提交时统一量化，digest 使用 JCS + SHA-256；时间戳、URL、本地路径和渲染缓存不进入 document digest。
- 浏览器本地命令负责即时交互和 Undo/Redo；自动保存发送完整规范文档并使用 Working Copy `rowVersion` 乐观更新，不持久化命令日志。
- 正式保存要求来源完整且 current；视觉类警告可以保存修订，但导出必须经过更严格预检。
- 正式渲染不能截取带选框/控制柄的编辑器 DOM；允许 E0 验证由 LayoutDocument 生成、无编辑 UI 的专用渲染场景，再由固定版本栅格器输出。
- 一个当前出版修订应能同时包含必需 PNG 与分页可选 PDF，避免单一 `currentExportRevisionId` 在 PNG/PDF 两种 kind 间来回覆盖；具体 kind/manifest 在 G5 契约中收口。

## 最终收口

- 页漫默认 `1800×2400`，条漫默认 `1080×1920`；改 profile 使用带完整迁移结果的命令，不改 Project.comicFormat。
- PanelFrame 与所属图片为受控复合对象，自由图片才是独立顶层元素；元素数组是图层，panelReadingOrder 单独保存。
- RichTextDocument 使用 paragraphs/runs、NFC 和固定 grapheme policy；字体复用 `Asset(type=font,role=layout_font)`。
- 自动保存发送完整规范文档并使用 rowVersion/digest；未改变的 stale/missing 外部引用可继续保存，新增/改变引用必须由 Server 证明。
- LayoutRevision 增加 previous/contentBasedOn/saveReason；离开只 flush Working Copy，显式保存才建修订。
- stale 替换先 preview，逐图选择 preserve/reset crop，commit 只更新 WC；来源变化使旧 digest 失效。
- 预检按 revision/export scope 分层；warning 确认绑定 document/source/profile/issues digest。
- Export runtime 收口为一个 `layout_publication` 多 Artifact 版本；页漫 PNG+可选 PDF，条漫切片+条件长图；ZIP 归 G6。
- E0 首选验证专用 HTML/SVG RenderScene + pinned Chromium，并用 SVG/resvg 对照；最终库只能由量化原型和新技术 ADR 锁定。

## 静态复核

- 新增三份方案/契约和一份验收清单，frontmatter/代码围栏/JSON 示例/内部路径检查通过。
- `git diff --check` 通过；未发现 `layout_png/layout_pdf` 仍作为 runtime current 的上位冲突。
- Working Copy、Revision、publication、G4 source 和 G6 ZIP 边界已交叉核对。
- Runtime/User Review 不适用：本轮无代码、Schema、依赖、页面、数据库或真实产物。
