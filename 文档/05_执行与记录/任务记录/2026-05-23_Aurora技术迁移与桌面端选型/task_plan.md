# 任务计划：Aurora 技术迁移与桌面端选型

---
doc_id: AIR-TASK-20260523-AURORA-TECH-PLAN
status: completed
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户请求参考 AuroraPlatformWeb 技术并判断桌面端取舍
---

## 目标

回查 AuroraPlatformWeb 的真实技术栈、模块设计、AI/OpenCode 工作流、素材与任务处理方式，判断哪些技术适合迁移到 AI漫游，并给出 Web 优先、桌面端优先或混合方案的选型建议。

## 当前阶段

已完成

## 阶段列表

### 阶段 1：需求与事实源恢复
- [x] 理解用户意图
- [x] 创建任务记录目录
- [x] 回查 AuroraPlatformWeb 技术栈和模块
- **状态：** completed

### 阶段 2：迁移价值评估
- [x] 判断可直接复用的技术
- [x] 判断需要改造后复用的技术
- [x] 判断暂不适合迁移的技术
- **状态：** completed

### 阶段 3：桌面端选型
- [x] 对比 Web、桌面端、Web+桌面壳
- [x] 给出 AI漫游 MVP 推荐路线
- [x] 记录风险与后续触发条件
- **状态：** completed

### 阶段 4：文档落盘与交付
- [x] 新增方案或 ADR
- [x] 更新 findings/progress
- [x] 写完成记录
- **状态：** completed

## 关键问题

1. AuroraPlatformWeb 中哪些技术是 AI漫游第一阶段真正需要的？
2. 哪些技术看起来强大但会让 AI漫游 MVP 过早复杂化？
3. AI漫游应该先做 Web、桌面端，还是 Web 优先并预留桌面端？

## 已做决策

| Decision | Rationale |
| --- | --- |
| 先做技术回查再下选型结论 | AuroraPlatformWeb 体量较大，不能只凭印象迁移 |
| 使用深思熟虑任务包记录本次调研 | 该任务涉及架构和产品形态选择 |
| Web 工作台核心优先，桌面壳后置 | 既复用 Aurora 成熟技术，又保留本地素材和未来桌面化空间 |

## 阻塞项

| Blocker | Owner | Needed Decision |
| --- | --- | --- |
| 无 | - | - |

## 注意事项

- 不把 Aurora 的复杂沙盒和脑训练 workflow 原样搬进 AI漫游。
- 优先判断 AI漫游故事/分镜/漫画图/素材工作流需要什么。
- 桌面端选型要同时考虑 AI 生成、文件管理、FFmpeg、本地模型和后续多人协作。
