---
doc_id: AIR-TASK-20260724-LAYOUTUI
status: active
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: ai-agent, developer
source: 用户反馈漫画成稿页面太挤、信息多、样式不统一
---

# 漫画成稿页面重构 task_plan

## 目标

把漫画成稿页从"专业编辑器平铺"重构为"阅读优先、点哪调哪、一键导出"：

- 默认干净浏览态，点中对象才出现相关操作
- 顶栏收敛为：章节/状态 + 撤销重做 + 智能重排入口 + 导出本章主按钮
- 智能入口合一（整章/页段/选中/场景走同一抽屉）
- 画布改米白纸色浮于暗色界面，建立 CSS design tokens 替换硬编码
- 不动 LayoutDocument 数据协议、任务协议、publication 契约

## 非目标

- 不改 V2 文档模型、Working Copy、Revision、publication 协议
- 不改其他工作台（分镜/候选图等）样式
- 不做拖拽裁切、拖尾巴端点等深度交互（第 2 期）
- 不拆组件文件结构（除非模板改动自然需要）

## 约束（来自契约测试）

`LayoutExportWorkspace.contract.test.mjs` 是源码正则契约，重构必须保留：

- `layout-authoritative-pending-preview`、双 `LayoutDocumentMiniPreview` + 双 `LayoutDocumentVisualPreview`、`authoritativePreviewReviewed`
- `layout-release-flow` 及「成稿预检/保存 Revision/出版预检/提交出版任务」步骤文案
- `balloon-appearance-presets`、`sfx-preset-controls`、`normalize-reserved-balloon`
- `LayoutKonvaInteractionLayer` 及其全部事件绑定
- `mobile-preview-feedback`、`openMobilePreview` 相关逻辑、章节 select `:disabled="loading || mobilePreviewBusy"`
- 响应式断点 `@media (min-width: 1024px) and (max-width: 1260px)` 中 `.editor-topbar flex-wrap: wrap`、`.top-actions flex: 1 1 100%`、`--layout-topbar-offset: 91px`
- `.layout-ai-drawer { top: var(--layout-topbar-offset) }`

## 阶段划分

| 期 | 内容 | 退出标准 |
| --- | --- | --- |
| P1a | 设计 tokens + 顶栏瘦身（删立即保存、手机预览收口、导出主按钮）+ 画布米白纸色与界面去噪 | 契约测试过、typecheck/lint 过、截图 |
| P1b | 左栏合并（工具条并入画布悬浮条、页面/素材面板可收起）+ 智能入口合一 | 同上 + 浏览器路径验证 |
| P2 | 交互简化：拖拽裁切、拖尾巴端点、素材拖入、换图镜头条 | 另立计划 |
| P3 | 导出抽屉整合版本/出版/预检 | 另立计划 |

## 本次执行范围

只做 P1a + P1b。P2/P3 完成后另议。

## 验收标准

- `node --test apps/web/src/components/workbench/LayoutExportWorkspace.contract.test.mjs` 通过
- web typecheck / lint 通过
- 相关 playwright 冒烟（layout 相关 spec）通过或说明环境限制
- 留截图证据
