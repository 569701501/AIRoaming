---
doc_id: AIR-TASK-20260724-MANGA-TEXT-STATE-FIX-FINDINGS
status: completed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# 发现与假设

## 已知症状

- 画布 selection 已切换到新文字对象，但富文本面板仍显示上一气泡内容。
- 富文本输入后编辑器 DOM 有内容，画布对象的可见文字为空。
- 气泡方向进入 Undo，气泡类型和文字未形成同等可恢复历史。
- 刷新后空文字状态持久存在，说明问题不只在 Konva 临时渲染。

## 已验证根因

1. `LayoutRichTextEditor` 原来只拼接 `.editor-paragraph`；浏览器根级全选替换会删除这些包装，因此 DOM 肉眼有字、提交值却为空。
2. 同一个富文本组件实例跨 `element.id` 复用，旧对象的 selection/composition 状态能写入新对象。
3. Shared command 与 V2 reducer 本身可正确修改正式字段；真正问题位于浏览器 DOM 到 command 的输入边界。
4. 单个键入事件原来各自使用独立 `commandId`，连续输入因此需要逐字 Undo；正确历史边界应是一段聚焦输入会话。
5. Konva 交互层与文字预览只消费正式文档，不是空文字根因；刷新后仍空也证明错误已进入 Working Copy。
6. 全局快捷键原先先排除 contenteditable，Cmd/Ctrl+Z 因此落入浏览器历史而不是 Session history。
7. 只等待 `document.fonts.ready` 不能代表受控字体 loader 已完成；字体状态必须由带 generation 的权威 loader 提供。
8. 资源 ready 前的滚动若不在最终 ready 时清空，会把“预加载期间看到底”误算成完整审核。
9. 手机预览若直接读取服务端 Working Copy，会在 dirty 草稿或已有 autosave 进行中时显示旧文字或误报失败。
10. 保存响应原先没有项目、章节和加载代次身份校验；章节 A 的迟到响应可覆盖章节 B 的 Session 状态。
11. 标准段落存在时忽略未知根节点，会漏掉其他浏览器产生的无 class block；DOM 结构检查又位于 `before===after` 早退之后，因此不能补救。

## 已采用修复

- 包装存在时继续保留段落解析；包装缺失时回退读取 contenteditable 根文本，并立即按正式模型重新水合 DOM。
- 富文本编辑器按 `primaryElement.id` 建立身份边界。
- 输入事件携带 `historyGroupId`，Session 仅在栈顶属于同一输入会话时合并快照；样式、气泡类型、方向等命令仍独立入栈。
- contenteditable 的键盘 Undo/Redo 由 Workspace 先阻止原生默认行为，再调用 Session history。
- 富文本按根 childNodes 顺序读取标准段落、未知块和根文本；结构漂移后按正式模型重建并恢复光标。
- 保存 flight 可等待，结果只在捕获的 `projectId/chapterId/loadGeneration` 仍为当前上下文时提交。
- Playwright 按同一 element id 校验编辑器、画布和 Working Copy，并覆盖三步 Undo/Redo。

## P1 发现与决策

1. 旧 Shared 预检只识别 overflow/glyph/来源问题，不能拦截“对象可见但规范化纯文本为空”；新增 `VISIBLE_TEXT_EMPTY` 为不可确认的 Revision/Export error。
2. 旧 1024～1260px CSS 直接隐藏顶栏最后两个动作，1180px 会失去手机预览和版本出版入口；现改为两行换行，不改变 1024px 以下只读边界。
3. 异步任务完成后再调用 `window.open` 容易触发弹窗拦截；手机预览必须在点击手势内同步开空白页，再进行导航，并对 blocked/navigation_failed 提供当前页兜底。
4. “展开完整预览”不等于“看过完整预览”；Pending 必须等待字体与可见图片 render-ready，加载错误保持禁用，并要求滚动到底或显式确认。
5. 手机预览必须等待既有 autosave；若等待期间又产生新修改，同一次 `flush()` 继续保存当前状态，而不是安全失败后让用户重复点击。
6. 手机预览准备期间禁用章节切换；底层仍以保存上下文身份校验作为最终防线。

## 真人使用结论

- 同一对象的 DOM、画布和数据库文字保持一致；刷新/手机预览仍能看到“是谁……在雨里？”和“沙——”。
- thought → shout、文字替换和 writing mode 具有独立历史边界；连续文字输入以一次自然编辑会话撤销。
- 首格真实成稿可以阅读，但气泡较窄、断行接近竖排且压到男性脸部边缘，仍需手动移动/放大；这属于自动排版视觉质量，不是文字状态丢失。
- 界面信息层级清楚、状态反馈完整，但属性面板较长，默认 24% 缩放下精调气泡/SFX 偏费力。
- 结论：编辑器已经从“普通用户不可用”恢复为“桌面内测可用”，但一键自动成稿的视觉直出质量仍不应宣称无需人工检查。

## 测试环境观察

- Server 全量测试在受限沙箱内会因 loopback、Chromium MachPort 和 tsx IPC 权限失败；授权复跑后仅一次 5 秒时序超时，精确单测复跑通过。
- 内置浏览器点击手机预览显示成功反馈；其标签列表未暴露弹出页，但直接只读路由可正常访问 11 段内容。合同测试已覆盖 blocked/navigation_failed，不把该环境差异判为产品失败。
- 最终独立复核为 S0=0、S1=0。剩余 S2 包括浏览器菜单 `beforeinput historyUndo/historyRedo`、字体错误的页内重试入口、无用 FontFace 的更细生命周期清理、保存请求超时/取消、极端字体缩放下的固定顶栏偏移，以及 V2 Unicode/default-ignorable 的显式覆盖补强；均不影响已验证的键盘、保存和预览主路径。
