# findings

## 2026-07-24 探索发现

- 目标文件 `apps/web/src/components/workbench/LayoutExportWorkspace.vue` 在会话期间被外部改动：初次读取 3163 行、模板 722 行；再次读取为 3972 行、模板 900 行，新增 `LayoutKonvaInteractionLayer`、`layout-release-flow`、`mobile-preview-feedback`、气球外观预设、SFX 预设等内容。git 工作区干净，说明改动已随 `3216f45 问题修复` / `cc54c65 漫画成稿更改` 提交。**后续一切编辑以最新磁盘内容为准，编辑前必须重新 Read。**
- 契约测试 `LayoutExportWorkspace.contract.test.mjs` 是源码正则契约，对模板结构、testid、文案、响应式断点都有硬约束（详见 task_plan 约束节）。
- 组件样式全部硬编码，0 个 CSS 变量；全局 `styles.css`/`styles-premium.css` 也无 token 体系。
- 当前布局：`.editor-shell` 四列 `48px 238px minmax(0,1fr) 320px`（工具条/导航/画布/属性）。
- 已有 `LayoutKonvaInteractionLayer` 交互层（裁切、guides、pan、text focus），P2 的拖拽裁切可能部分已存在，P1 不重动。
- e2e 对顶栏按钮名有硬依赖：`立即保存`、`手机预览`、`重新排一版`、`智能调整`、`版本与出版` 分布在 5 个 spec。结论：图标化按钮保留 aria-label 原名即可不破坏 spec；「版本与出版」→「导出本章」需同步 5 个 spec。
- 直接 `playwright test` 跑 db 类 spec 会报 `G2_DB_MODE_REQUIRED`，必须用 `node tests/e2e/support/run-e2e-matrix.mjs --mode=db`；该 runner 忽略文件参数、总是跑整套 db 套件。
- `layout-editor-m4.spec.ts` 在改动前基线即失败（Konva 交互层 canvas 拦截 `.canvas-element.type-panel_frame` 点击），属既有问题，建议另行诊断。
- e2e 跑完会重写 `文档/05_执行与记录/**/evidence/*.png`，git stash/pop 前需先 checkout 这些证据文件避免冲突。
