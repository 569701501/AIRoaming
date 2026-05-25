# 任务计划：漫画工作室视觉风格重构

---
doc_id: AIR-TASK-20260523-COMIC-STUDIO-STYLE-PLAN
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户提供 AI Comic Studio 风格参考图
---

## 目标

在保留“左侧对话、右侧输出内容”主链路的前提下，将前端视觉调整为更接近 AI Comic Studio 的轻量漫画创作软件风格。

## 非目标

- 不修改后端 API。
- 不修改 shared DTO、任务协议或 Prisma schema。
- 不接入真实漫画图片生成、排版导出、团队协作和权限系统。

## 阶段

| 阶段 | 状态 | 结果 |
| --- | --- | --- |
| 参考拆解 | completed | 提取白底、紫色动作、左侧导航、顶部搜索、轻卡片、输出工作区、右侧队列等设计特征 |
| 前端重构 | completed | 改造 `App.vue` 与 `styles.css` |
| 验证留痕 | completed | 构建、类型检查、页面连通、截图证据、完成记录 |

## 决策

| Decision | Rationale |
| --- | --- |
| 保留左对话右输出 | 符合用户前一轮确认的核心链路 |
| 增加全局侧边栏和顶部栏 | 对齐参考图的创作软件外壳 |
| 主动作色改为紫蓝 | 对齐参考图的品牌和按钮语言 |
| 输出区使用轻卡片和漫画占位画面 | 让页面更像漫画生产工作台，而不是抽象工具页 |

## 退出标准

| 标准 | 状态 | 证据 |
| --- | --- | --- |
| 页面形成漫画工作室风格 | pending | UI 结构和样式完成 |
| 页面形成漫画工作室风格 | completed | 新增品牌侧栏、顶部搜索、英雄输出区、流程卡、右侧队列/提示栏 |
| 左侧对话仍可创建项目 | completed | `submitProject` 保留并绑定在左侧创建表单 |
| 右侧仍有故事、分镜、素材、导出输出区 | completed | 输出 Tab 保留 |
| 静态验证通过 | completed | `corepack pnpm build`、`corepack pnpm typecheck` |
| 文档留痕完成 | completed | 任务记录和完成记录已更新 |
