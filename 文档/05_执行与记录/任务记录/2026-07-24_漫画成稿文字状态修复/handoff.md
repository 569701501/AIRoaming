---
doc_id: AIR-TASK-20260724-MANGA-TEXT-STATE-FIX-HANDOFF
status: completed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: ai-agent, developer, qa
source: task_plan.md、源码、测试与真人浏览器复核
---

# 实施 Handoff

## 当前结论

上轮真人验收中的文字丢失、跨对象串写和不完整 Undo/Redo 已关闭。编辑器 DOM、`LayoutDocumentV2`、Working Copy、画布预览和手机只读预览现在使用同一份文字事实；可见空文字无法进入 Revision 或 Export。后续独立复核发现的快捷键、字体、完整审核、dirty 手机预览、章节保存竞态和跨浏览器根段落六类 S1 也已关闭，最终 S0=0、S1=0。

## Web 状态边界

- `LayoutRichTextEditor.vue`
  - 按根 childNodes 顺序读取标准段落、未知块和根文本；正常 Enter 只产生一个换行，跨浏览器无 class 段落也不会丢失。
  - 根级全选替换或结构漂移后，按正式模型重建 DOM 与光标。
  - 一次 focus 输入会话生成稳定 `historyGroupId`；blur 结束该会话。
- `LayoutExportWorkspace.vue`
  - 富文本组件按 `primaryElement.id` 重建，旧 selection/composition 不得写入新对象。
  - `historyGroupId` 只作为 Session 执行选项，不进入 Shared command payload 或持久文档。
  - contenteditable 内 Cmd/Ctrl+Z、Cmd/Ctrl+Shift+Z 与 Ctrl+Y 进入 Session history。
  - 1024～1260px 顶栏换行，保留手机预览与版本出版；1024px 以下仍是只读保护。
  - 手机预览在点击手势内同步打开空白页，等待当前保存且准备期间禁用章节切换；弹窗被拦截或导航失败时提供当前页兜底。
- `layout-editor-session.ts`
  - 相邻快照只有在同一 `historyGroupId` 且位于栈顶时合并，`before` 保留本次 focus 开始前状态。
  - 类型、样式、方向、SFX 预设和其他命令继续独立入历史。
  - 保存 flight 可等待；成功、冲突、错误和重试状态只有在 `projectId/chapterId/loadGeneration` 仍匹配时才能落地。

## 预检与完整预览

- Shared 新增 `VISIBLE_TEXT_EMPTY`：
  - 仅检查可见、opacity 大于 0 的 text/balloon。
  - 规范化纯文本为空时产生 `error`。
  - 阻断 `revision` 和 `export`，不可通过 warning acknowledgement 绕过。
  - issue 精确携带 canvasId/elementId。
- Pending 权威预览：
  - 所有可见图片与字体就绪后才进入可复核状态。
  - 任一图片或字体加载错误都 fail-closed。
  - 可滚动内容必须浏览到底；完整内容无需滚动时必须显式确认。
  - “使用这版新排法”只在 `renderReady && fullyViewed && !error` 时启用。

## 测试证据

| 验证 | 结果 |
| --- | --- |
| Shared 全量 | 37 files / 250 tests passed |
| Web 默认测试 | 47/47 passed |
| 根类型检查 | Shared / Web / Server passed |
| E2E 类型检查 | passed |
| production build | Shared / Server / Web passed；仅既有 AppShell chunk warning |
| 编辑器 DB-only E2E | 1/1 passed（37.5s），实际视口 1180×900 |
| 智能预览 DB-only E2E | 4/4 passed（46.5s） |
| 保存竞态定向合同 | 3/3 passed |
| 差异检查 | passed |
| Server 沙箱失败复核 | 权限失败的 7 files 在授权环境为 180/181；唯一 5s timeout 精确复跑 1/1 passed |

## 真人路径

```text
打开“雨夜点名”
→ 选择 thought 气泡
→ 输入“雨里……是谁在叫我的名字？”
→ Undo / Redo 检查画布和编辑器一致
→ 应用蓝色 thought 预设
→ 新增文字，确认不是上一对象内容
→ 输入“沙——”并应用电光 SFX/semantic
→ 长对白出现“文字溢出”
→ 缩短为“是谁……在雨里？”后警告消失
→ 自动保存到 Working Copy v111
→ 打开 11 段手机只读预览
```

证据：

- `evidence/真人创作_编辑器.png`
- `evidence/真人创作_手机只读预览.png`

## 已知边界

- 自动排版首格 thought 气泡较窄，断行接近竖排并触及人物脸部边缘；需要手动移动或放大，属于视觉排版质量问题。
- 属性面板较长；默认 24% 缩放适合看全局，不适合精确检查小字号和 SFX。
- 浏览器菜单/右键原生撤销、字体失败后的页内重试、无用 FontFace 主动清理、保存请求超时/取消、极端字体缩放下的固定顶栏偏移和 V2 Unicode 显式覆盖仍是 S2；键盘主路径和最终文档状态不受影响。
- 滤镜、网点、发光、新轮廓和图层命名继续属于 V3 候选，不在本次状态修复范围。
