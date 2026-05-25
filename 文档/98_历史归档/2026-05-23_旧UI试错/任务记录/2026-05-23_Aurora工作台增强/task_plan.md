# 任务计划：Aurora 工作台增强

---
doc_id: AIR-TASK-20260523-AURORA-WORKBENCH-PLAN
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户反馈工程骨架过于简单，要求更深入参考 AuroraPlatformWeb
---

## 目标

将当前简单状态页升级为更接近 AuroraPlatformWeb 的创作工作台：固定顶部工具区、工作台 tabs、工作流面板、故事编辑区、分镜看板、素材候选区、任务中心和 AI 协作侧栏。

## 阶段列表

### 阶段 1：参考回查
- [x] 回查 `DirectorWorkbench.vue`
- [x] 回查 `ProjectMaterialTaskPopover.vue`
- [x] 回查 `DirectorImageGalleryPanel.vue`
- **状态：** completed

### 阶段 2：后端工作台快照
- [x] 新增 project/workbench 快照 DTO
- [x] 新增 NestJS project API
- **状态：** completed

### 阶段 3：前端工作台增强
- [x] 替换简单状态页为 Aurora 式工作台布局
- [x] 增加任务 popover/任务中心
- [x] 增加素材候选面板和分镜看板
- **状态：** completed

### 阶段 4：验证与留痕
- [x] build/typecheck
- [x] API smoke
- [x] 完成记录
- **状态：** completed

## 已做决策

| Decision | Rationale |
| --- | --- |
| 不直接复制 Aurora 组件源码 | Aurora 绑定大量项目上下文，AI漫游需要迁移模式而不是粘贴实现 |
| 使用工作台快照 API | 让前端不是纯静态 mock，为后续接 Prisma 留入口 |
| 保持 GenerationTask mock | 本轮重点是工作台形态增强，任务持久化放下一步 |
