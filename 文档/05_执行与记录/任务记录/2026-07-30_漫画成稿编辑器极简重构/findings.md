---
doc_id: AIR-TASK-20260730-002
status: active
created: 2026-07-30
updated: 2026-07-30
owner: AI漫游项目
audience: ai-agent
source: 2026-07-30 代码梳理与历史记忆
---

# findings — 漫画成稿编辑器极简重构

## 现状代码事实(2026-07-30 探索)

### 前端结构(LayoutExportWorkspace.vue 3901 行模板分区)

| 区块 | 行号(约) | 内容 |
| --- | --- | --- |
| 顶栏 | L3-31 | 章节选择、保存状态、手机预览、导出 |
| 导出对话框 | L94-194 | blocked / review / ready / failed / 进行中 五阶段,逻辑成熟,**不动** |
| 缺稿态 | L196-253 | legacy 转换卡片 + 首次智能排版卡片,**不动** |
| 左侧栏 | L256-312 | 页面/段落导航(复制/前后移/新增)+ 镜头素材栏(放入画格/自由图/替换)+ 来源状态 |
| 画布工具条 | L315-334 | 左对齐/水平居中/顶对齐/水平分布/复制对象 + 缩放滑杆 |
| 画布浮动工具 | L336-352 | 选择/平移/裁切 + 添加画格/自由图/文字/气泡 |
| 换图镜头条 | L353-369 | 选中图片元素时横向替换条 |
| 画布 | L370-433 | DOM 元素投影 + Konva 交互层 |
| 右侧属性面板 | L436-715 | 属性/图层两 Tab;属性含:锁定/隐藏/删除、精确几何(X/Y/宽/高/旋转/透明)、画格(形状/圆角/边框/分离自由图)、图片与裁切(缩放/旋转/偏移/翻转/重置)、文字语义+SFX 预设、富文本编辑器、气泡(类型/外观预设/RGBA/描边/垂直对齐/4向 padding/尾巴 5 字段)、文字预检摘要、阅读顺序、页面设置(尺寸/段高/模板) |
| 右键菜单 | L742+ | 复制/裁切/分离/放回/上下移/锁定/隐藏/删除 |

### 关键 composable / 组件

- `composables/layout-editor-session.ts`(796 行):working copy 加载、自动保存(idle 800ms / 最长 5s)、命令执行、冲突恢复、V1/V2 双栈、无 undo。
- `LayoutKonvaInteractionLayer.vue`(664 行):拖拽(多选)、Transformer、裁切手柄、尾巴拖拽、右键命中。
- `LayoutRichTextEditor.vue`(504 行):富文本面板,IME/grapheme 安全。
- `LayoutElementTextPreview.vue`:静态文字/气泡预览,纯展示。

### 历史教训(来自 MEMORY.md,实施时必须遵守)

- `runContextMenuAction` 必须先执行动作再关菜单(闭包引用菜单关闭后为 null)。
- V2 命令 payload 是严格 JSON,克隆必须 JSON 序列化(不能 structuredClone Vue Proxy)。
- TEXT_OVERFLOW blockingScopes=["export"] 在导出对话框是硬阻断。
- 导出对话框遮罩会拦截画布点击,e2e 后续操作前需点「完成」。
- 等待编辑器就绪用 `shot-tray` 或 `.editor-shell`;**左栏抽屉化后 e2e 等待锚点要改**。
- "导出完成"文案出现两次,locator 必须 `.first()`。
- `layout-editor-shell` 根容器常驻可见,是稳定锚点,重构后必须保留该 testid。

### 已退役/沉睡能力(本任务不激活也不删底层)

- full/scoped_reflow、5 种排版 intent、保护 scope 显式管理(契约+服务端完整,UI 只发 initial)。
- `LayoutCommandHistoryV1`(commands.ts L648-691,无引用)——M4 的本地 Undo **不复用**该结构,直接在 session 层做内存快照栈,避免激活历史协议。
- Pending 命令两段式(手机 AI)、版本历史 UI、导出历史列表 UI。

## 风险与待验证点

- [ ] 拖拽"盲拖"根因需 M3 现场确认:Konva 层拖动时 DOM 预览不更新,松手才 commit;方案是 dragmove 时同步视觉投影。
- [ ] 就地文字编辑与 IME 的兼容性,需复用 grapheme 安全逻辑。
- [ ] e2e `layout-editor-m4/m5/m6`、`layout-publication-m7` 对旧面板 testid 的依赖面,crop-controls / balloon-controls / text-semantic-controls / sfx-preset-controls / layout-preset-picker / layout-profile-resize-preview 等 testid 迁移策略(保留 testid 但挪位置,减少断言改动)。
