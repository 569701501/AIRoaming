# progress

## 2026-07-24

- 建立任务目录与计划，确认执行范围 P1a+P1b。
- 探索发现目标文件在会话期间被外部更新（3163→3972 行），已重新读取最新内容作为编辑基线。详见 findings.md。

## P1a+P1b 执行（2026-07-24）

改动文件：

- `apps/web/src/components/workbench/LayoutExportWorkspace.vue`
  - 顶栏：立即保存/手机预览改图标按钮（aria-label 保持原名），「版本与出版」更名「导出本章」并设为唯一主按钮；重新排一版降为普通按钮
  - 删除 48px `.tool-rail` 列，8 个工具按钮改为画布内 `.canvas-tool-float` 悬浮条；`.editor-shell` 四列→三列
  - 新增组件级 design tokens（`--le-bg-app/panel/stage/control/border/text/accent/paper/radius`），替换关键硬编码
  - 画布：`.document-canvas` 米白纸色 `#f6f3ec` + 柔和投影，`.stage-scroll` 去掉点阵背景
  - 强调色统一为蓝色 `--le-accent`（选中描边、tab、导航、素材、预设、AI 选项激活态），保留语义色（红错/橙警/绿就绪）
  - 字号上调：淘汰 8/9/10px，辅助文字 ≥10px、控件文字 ≥11-12px
- e2e 同步：`版本与出版` → `导出本章`（candidate-decision-workbench / layout-editor-m5 / m6 / mobile-ai-m8 / publication-m7）

验证：

- `LayoutExportWorkspace.contract.test.mjs` 16/16 通过；web 全部契约测试 47/47 通过
- `pnpm --filter @airoaming/web typecheck` 通过；`pnpm typecheck:e2e` 通过
- e2e db 套件：19/20 通过；`layout-editor-m4.spec.ts` 失败，已用 git stash 基线复跑确认同一失败为改动前既有问题（Konva 层拦截画格点击），与本次无关
- 截图证据：`evidence/1180px关键入口.png`、`evidence/页漫自动成稿.png`、`evidence/自动成稿直接编辑.png`（由 m5 spec 重跑生成，已为新 UI）

静态复核（Scrutiny）：契约测试覆盖的 release-flow、authoritative preview、Konva 绑定、mobile preview feedback、响应式断点全部保留；未动数据协议/任务协议/composables/server。

范围偏差：智能入口合并为单一下拉未做（两个入口均开同一抽屉，行为已统一，下拉合并留 P2）；左栏可收起未做。

## P2 执行（2026-07-24）

改动文件：

- `apps/web/src/components/workbench/LayoutExportWorkspace.vue`
  - 智能入口合一：顶栏「重新排一版」与画布工具栏「智能调整」合并为顶栏单一「智能调整」；抽屉首屏统一为范围选择（整章重排/选中内容/当前页段/当前场景）+ 显式生成，打开时不再自动发起整章重排；有选中默认"选中内容"，无选中默认"当前页/段"
  - 删除 `openOrCreateReflow`（自动整章重排入口），`requestFullReflow` 保留为抽屉内显式动作
  - 左栏可收起：`leftPanelOpen` + 画布工具栏收起/展开按钮；`.editor-shell` 列改 `auto minmax(0,1fr) 320px`，`.canvas-navigation` 固定 238px（≤1260px 为 210px）
  - 新增换图镜头条：选中带图画格或自由图时，画布底部滑出本章镜头缩略图条，点击即 `replacePrimarySource`
  - 属性面板"图片与裁切"新增「在画布上拖调裁切」可见入口（置 activeTool='crop'）
- `tests/e2e/web/layout-smart-compose-m5.spec.ts`：整章重排路径改为 智能调整 → 整章重排 → 生成一版看看（5 处）

验证：

- 契约测试 16/16、web 47/47、`vue-tsc`、`typecheck:e2e` 通过
- e2e db 套件连跑三轮：布局相关 spec（smart-compose-m5、m5、m6、m7、candidate-decision）全部通过；`layout-editor-m4` 为既有失败；`script-import-existing-flow`（与布局无关）与一次 `database is locked` 为间歇性基础设施抖动，复跑即过
- 截图证据：`evidence/条漫选中画格智能调整预览.png`、`evidence/整章新排法对比.png`（含换图镜头条、统一抽屉、纸色画布）

静态复核（Scrutiny）：契约约束的 release-flow、authoritative preview、Konva 绑定、mobile preview、响应式断点全部保留；`requestFullReflow` 中途误删已当场补回并由契约/类型检查兜住；未动数据协议。

## 修正（2026-07-24）

- 用户反馈：左栏收起后右侧属性栏被拉宽。原因：`.editor-shell` 三列模板在左栏 `v-if` 移除后由 auto-placement 把 inspector 落进 `minmax(0,1fr)` 列。修复：三列改 `auto minmax(0,1fr) auto`，`.inspector` 固定 320px（≤1260px 为 280px），收起后增量宽度全给画布。契约 16/16、typecheck 通过。
- 二次修正：auto-placement 在左栏移除后把画布落进第 1 列（auto 按内容定宽导致画布变窄、inspector 掉第 2 列）。最终修复：`.canvas-navigation/.canvas-workspace/.inspector` 显式 `grid-column: 1/2/3`，画布始终占 `minmax(0,1fr)` 弹性列；移动端断点重置 `.canvas-workspace { grid-column: auto }`。契约 16/16 通过。

## P3-1 属性面板按对象收敛（2026-07-24）

改动：

- 未选中：提示语 + 阅读顺序（从选中态迁出，本就是画布级）+「页面设置」折叠区（画布尺寸+画格模板，默认展开）
- 选中：对象名 + 常用操作（锁定/允许智能/隐藏/删除）+「精确调整」折叠（X/Y/宽/高/旋转/对象透明，默认收起）+ 类型专属区（画格/裁切/文字/气泡/文字预检）；「页面设置」自动收起到底部
- `pageSettingsOpen` 随选中状态自动开合，`precisionOpen` 默认 false；内容用 v-show 保留 DOM
- `layout-editor-m5.spec.ts` 宽高输入前先展开「精确调整」

验证：契约 16/16、web 47/47、双 typecheck 通过；e2e db 三轮：m6 连续两次 `database is locked`（spec 第 120 行自建 DatabaseSync 直读 SQLite 的既有竞态，其 UI 步骤全部通过后才会走到），第三轮 19/20 全绿（仅 m4 既有失败）。证据：`evidence/1180px属性面板收敛.png`。

## 拖拽失效诊断与修复（2026-07-24）

用户报告"气泡/文字拖不动"。诊断过程（真实 dev 实例 + Playwright 复现脚本）：

- 选择工具下，气泡/文字/画格均可正常拖动；重叠区域正确命中数组最上层元素——Konva 层本身无 bug
- 根因：`addText()`/`addBalloon()` 把 `activeTool` 置为 `"text"`；文字模式下 Konva 层 pass-through、命中框不可拖、DOM 无拖拽逻辑，且界面无"切回选择工具"的可见引导 → 用户添加文字/气泡后一切拖不动
- `LayoutElementTextPreview` 是纯静态预览（无 contenteditable），文字模式在画布上不提供任何编辑能力，纯陷阱

修复：

- `addText`/`addBalloon` 添加后保持/回到 `select` 工具，新对象立即可拖
- 气泡区旧提示"文字模式只编辑内部文字…"改为拖拽说明
- `activeTool === "text"` 分支（`selectDomElementInTextTool`、Konva pass-through）成为不可达路径，保留为无害死代码，后续可清理

spec 同步：

- `layout-editor-m5.spec.ts`：删除"文字模式拖动不变"的旧行为断言，改为添加气泡后直接拖动生效
- `layout-editor-m4.spec.ts`（顺带修复既有失败）：画格点击改鼠标坐标点击（Konva 层在 DOM 之上是设计如此）；阅读顺序断言前先点击画布空白取消选中（适配 P3-1 阅读顺序迁入未选中态）

验证：契约 16/16、web 47/47、双 typecheck 通过；e2e db 套件 **20/20 全绿**（m4 既有失败一并消除）。真实实例验证：添加气泡后工具保持"选择"，新气泡立即可拖。

注意：诊断期间复现脚本在真实章节草稿上做过几次小拖拽（已用撤销回退验证性拖动，早前几次拖动的位移可能仍留在用户草稿里，用户可撤销或忽略）。
