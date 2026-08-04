---
doc_id: AIR-TASK-20260730-004
status: active
created: 2026-07-30
updated: 2026-07-30
owner: AI漫游项目
audience: ai-agent
---

# Scrutiny Review — 漫画成稿编辑器极简重构(静态复核,只读)

## 复核范围

M1~M5 全部改动:LayoutExportWorkspace.vue、LayoutKonvaInteractionLayer.vue、layout-editor-session.ts、新增 LayoutExportDialog.vue / LayoutCanvasSettingsDrawer.vue / layout-export-dialog.ts、契约测试、6 个 e2e spec、2 个服务端源码锁存 spec、当前UI信息架构.md、ADR-0023。

## 结论:通过(带 3 条残留风险)

### 与 task_plan 一致性

| 决策 | 落实 | 证据 |
| --- | --- | --- |
| D1 右侧常驻面板移除 | ✅ 属性面板改 `inspector.is-overlay`,默认收起,浮动工具条 +「更多」 | workspace L460 |
| D2 左栏默认收起 | ✅ `leftPanelOpen=ref(false)`,`canvas-navigation.is-overlay` | workspace L186 |
| D3 设置抽屉 | ✅ `LayoutCanvasSettingsDrawer.vue` 承载画布尺寸/段高/模板 | 抽屉组件 |
| D4 画布直接操纵 | ✅ dragmove/transform emit previewTransform 合并进 elementStyle;dblclick→就地 textarea | Konva 层 + workspace |
| D5 本地撤销 | ✅ session `undoStack` 上限 50,execute/executeBatch 入栈,replaceFromServer 清空,无 redo | layout-editor-session.ts |
| D6 主题 | ✅ `--le-accent:#8b5cf6`,背景 `#0a0d14`,选中态单色 | workspace 样式 |
| D7 图层降级 | ✅ 图层保留在属性浮层 Tab,右键菜单/工具条保留锁定/隐藏/层移 | workspace |
| D8 对齐收纳 | ✅ 常驻工具条已移除对齐/分布,仅在多选浮动工具条 | workspace |

### 协议与边界

- 未改 `packages/shared`、server 任何 layout service、导出对话框流程、手机只读预览。✅
- 就地文字编辑复用正式命令 `text.replace_document` / `balloon.replace_text_document`,与富文本面板同路径;无 range 计算,IME 安全。✅
- 拖拽预览只改视觉投影,提交仍走 `normalizeKonvaTransformBatchV1` + 正式命令,预览与提交同函数归一,不会漂移。✅
- 撤销栈为 `structuredClone` 全文档快照,自动保存经既有 CAS 通道,跨标签冲突语义不受影响。✅

### 残留风险

1. **就地编辑会丢失元素内混排样式**:双击改字按首段样式重建全部段落;同一段内多种字重/颜色会被统一。复杂排版仍可走「属性」浮层富文本编辑器。已确认为 D4 的取舍(用户选了"就地改字,复杂排版走更多")。
2. **撤销栈内存占用**:上限 50 份全文档快照,极端大文档(接近 8MB codec 上限)会有内存压力;实际章节文档通常 <200KB,可接受。
3. **左栏展开时画布工具列右移 272px** 是固定像素,窄屏(1024~1260px)下与缩放滑杆区可能拥挤;当前 1260px 媒体查询未覆盖该偏移,后续可按真实反馈微调。

### 验证记录

- `vue-tsc` / `vite build` / web 契约 55/55 / 服务端 g5 spec 6/6 / `corepack pnpm test` 全绿 / `typecheck:e2e` 通过 / e2e db 套件 18/18。
- 真实浏览器冒烟(雨夜末班车项目,dev 实例):默认无面板、三浮层可开关、浮动工具条三类选中形态、拖拽实时预览、双击就地改字、撤销逐像素还原;console 零错误;冒烟改动已恢复。
