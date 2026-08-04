---
doc_id: AIR-TASK-20260730-003
status: active
created: 2026-07-30
updated: 2026-07-30
owner: AI漫游项目
audience: ai-agent
---

# progress — 漫画成稿编辑器极简重构

## 2026-07-30

### M0 设计定稿(已完成)

- 用户需求确认:流程保持「自动排版 → 手动调整 → 导出」;只改编辑器 UI/交互;形态为「极简画布 + 浮动工具条」;四类核心操作=挪气泡/改遮挡、改文字内容、调裁切范围、移动/缩放画格。
- 完成现状梳理(代码探索 + 记忆 + 必读文档),建立任务目录。
- D1~D8 经用户逐项确认并冻结(撤销按 D5 做、左栏默认收起、双击画布就地改字)。

### M1 布局骨架(已完成)

- 改动文件:
  - 新增 `apps/web/src/components/workbench/LayoutExportDialog.vue`(导出对话框五阶段 + 全部 issue 文案 helper,主题改紫)、`LayoutCanvasSettingsDrawer.vue`(画布尺寸/段高/画格模板抽屉)、`layout-export-dialog.ts`(共享 stage/issue 类型)。
  - `LayoutExportWorkspace.vue`:三栏 grid 改单栏画布优先;左栏(页面导航+镜头素材)改 `is-overlay` 浮层、默认收起;右侧属性面板改 `is-overlay` 浮层、默认收起,画布工具条加「属性」入口;页面设置/模板迁入设置抽屉,顶栏加「画布设置」入口;主题令牌 `--le-accent` 蓝 `#4f8cff` → 紫 `#8b5cf6`(并入全局 styles-premium 视觉),背景并入 `#0a0d14`。
  - 契约测试 4 条对话框相关断言改指向 `LayoutExportDialog.vue`。
- 修复:浮层 `top:0` 盖住画布工具条按钮(Playwright 点击被拦截)→ 浮层统一 `top: 45px`(工具条高度)起。
- 验证:`vue-tsc` 通过;`vite build` 通过;web 契约测试 55/55;dev 实例真实浏览器冒烟(雨夜末班车项目):editor-shell 默认无左右面板、左栏/设置抽屉/属性浮层均可开关、console 零错误,截图 `/tmp/m1-smoke-*.png`。

### M2 浮动上下文工具条(已完成)

- 改动:`LayoutExportWorkspace.vue` 新增 `.selection-toolbar`(画布内绝对定位,随选中元素上方/下方就近浮出);单选=裁切(有图时)/气泡类型下拉/尾巴开关/放回画格(自由图)/复制/锁定/删除/更多(开属性浮层),多选=左对齐/水平居中/顶对齐/水平分布/删除;常驻画布工具条移除对齐/分布/复制按钮(D8)。
- 验证:typecheck + web 契约 55/55;真实浏览器冒烟:气泡/画格/多选(Ctrl+A)工具条均就近出现、动作可用、console 零错误,截图 `/tmp/m2-smoke-*.png`。
- 备注:shift+点击在 Konva 层未触发加选(既有行为,与本次无关),多选冒烟用 Ctrl+A。

### M3 画布直接操纵(已完成)

- 改动:
  - `LayoutKonvaInteractionLayer.vue`:dragmove/Transformer transform 期间 emit `previewTransform`(复用 `normalizeKonvaTransformBatchV1`,与提交同一路径归一),dragend/transformend/cancelGesture 清空;节点 `dblclick` emit `editText`。
  - `LayoutExportWorkspace.vue`:`previewTransforms` 合并进 `elementStyle` 与浮动工具条定位(拖动全程 DOM 预览跟随,松手才提交命令);新增画布内就地文字编辑器(双击文字/气泡弹出 textarea,blur 或 Cmd+Enter 提交,Esc 取消),提交按首段样式重建段落、复用 `text.replace_document`/`balloon.replace_text_document` 正式命令,不做 range 计算,天然 IME 安全。
- 验证:typecheck + web 契约 55/55;真实浏览器冒烟:拖动中 left/top 实时变化且与提交值一致;双击气泡→就地编辑→blur 提交→文字生效;console 零错误。
- 数据卫生:冒烟改动了真实测试项目(雨夜末班车)一个气泡的位置与文字,已用同路径恢复(位置逐像素还原、文字还原、已保存 v25)。

### M4 有限本地 Undo(已完成)

- 改动:`layout-editor-session.ts` 新增 `undoStack`(V1/V2 全文档 structuredClone 快照,上限 50,`LAYOUT_UNDO_STACK_LIMIT`),execute/executeBatch 成功后入栈,`replaceFromServer` 清空(服务端重载/切章后不可跨基线撤销);`LayoutExportWorkspace.vue` 顶栏加撤销按钮(data-testid=`layout-undo`)+ Cmd/Ctrl+Z;契约测试从"禁止 undo"改为锁定本地撤销形态(无 redo、无 pending AI 状态)。
- 验证:typecheck + web 契约 55/55;真实浏览器:拖动画格→Ctrl+Z 位置逐像素还原→栈空按钮禁用→自动保存正常;console 零错误。

### M5 高级收纳 + 测试重写(已完成)

- e2e 重写(操作路径改为「先展开对应浮层再操作」,testid 全部不变):m4(左栏/画布设置抽屉/属性浮层/图层)、m5(富文本+气泡全程在属性浮层)、m6(两次 reload 后展开左栏)、m7(4 处 shot-tray 等待)、m8(画布尺寸在设置抽屉)、smart-compose(3 处)。
- 修出真实 UI bug:左栏浮层盖住画布工具列(1180px 下「添加文字」被 shot-tray 拦截点击,e2e 逼出)→ `.stage-wrap.has-left-panel .canvas-tool-float { left: 272px; }`。
- 服务端源码锁存 spec 同步:g5-m4-layout-editing、 g5-m8-cutover 的画格模板/画布尺寸断言改指向 `LayoutCanvasSettingsDrawer.vue`。
- 契约测试:LayoutExportWorkspace 55/55;服务端 g5 spec 6/6;`corepack pnpm test`(shared+server)全绿;`typecheck:e2e` 通过;e2e db 套件 18/18(含 m4/m5/m6/m7/m8/smart-compose)。
- 文档同步:`当前UI信息架构.md` 漫画成稿行更新为画布优先形态;新增 `ADR-0023_漫画成稿编辑器极简画布与有限本地撤销.md`。

### M6 复核与留痕(进行中)

- Scrutiny Review(静态复核)已完成:结论=通过,残留风险 3 条,见 `scrutiny_review.md`。
- 留痕:ADR-0023、`当前UI信息架构.md` 更新、完成记录 `功能完成记录/2026-07-30_漫画成稿编辑器极简重构.md`、MEMORY.md 更新(新增条目 + 07-26 P1 后置标记已完成)。
- 全部门禁:web typecheck/build/契约 55/55、shared+server 777/777、typecheck:e2e、e2e db 18/18。
- Runtime/User Review:等待用户按验收清单在真实浏览器过一遍(task_plan §6 七条)。
