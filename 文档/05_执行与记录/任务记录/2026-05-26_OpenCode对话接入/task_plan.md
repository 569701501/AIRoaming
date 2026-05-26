# 任务计划：OpenCode 对话接入

---
doc_id: AIR-TASK-20260526-OPENCODE-DIALOGUE-PLAN
status: completed
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户请求：帮我把 opencode 接进去，并测试对话
---

## 目标

把 OpenCode 作为 AI漫游第一阶段对话运行时接入到项目工作区，让剧本步骤的左侧对话框可以发送真实消息，并返回可读的 AI 回复。

## 当前阶段

阶段 6：交付与留痕

## 阶段列表

### 阶段 1：需求与事实源恢复
- [x] 理解用户意图：接入 OpenCode，不继续 mock 对话。
- [x] 读取相关事实源。
- [x] 探测本机 OpenCode HTTP 接口。
- **状态：** completed

### 阶段 2：方案与拆解
- [x] 明确最小闭环：后端封装 OpenCode，前端只调用 AI漫游 API。
- [x] 明确首个落点：项目工作区第 1 步“剧本”的对话框。
- [x] 明确验收标准：能创建项目、进入剧本页、发送消息并看到 OpenCode 回复。
- **状态：** completed

### 阶段 3：Worker 执行
- [x] 新增共享 DTO。
- [x] 新增后端 OpenCode 运行时与对话模块。
- [x] 前端对话框接入真实消息列表与发送动作。
- [x] 保持剧本文档只由用户保存，不被 AI 自动覆盖。
- **状态：** completed

### 阶段 4：Scrutiny Review
- [x] 静态复核模块边界。
- [x] 检查 API 契约与文档一致。
- [x] 检查是否泄露 OpenCode 配置中的密钥。
- **状态：** completed

### 阶段 5：Runtime/User Review
- [x] 构建或类型检查通过。
- [x] 使用本地 OpenCode 发送真实短消息。
- [x] 记录验证命令和结果。
- **状态：** completed

### 阶段 6：交付与留痕
- [x] 更新长期事实源。
- [x] 新增功能完成记录。
- [x] 汇总残留风险。
- **状态：** completed

## 关键问题

1. OpenCode 的 HTTP 接口返回结构是什么？
2. AI漫游是否需要直接暴露 OpenCode 配置？
3. 当前对话记录如何存储？

## 已做决策

| Decision | Rationale |
| --- | --- |
| 后端封装 OpenCode，前端不直连 OpenCode | 保持运行时可替换，避免前端绑定第三方接口。 |
| 首版使用内存对话记录 | 当前项目数据仍是本地内存与 workspace 文件阶段，先完成最小闭环。 |
| 对话只给建议，不自动改写右侧剧本文档 | 符合“人工可控”，避免 AI 一句话覆盖用户稿。 |
| 不把 OpenCode `/config` 的敏感字段写入文档或前端 | OpenCode 配置中可能包含 API Key。 |

## 阻塞项

| Blocker | Owner | Needed Decision |
| --- | --- | --- |
| 无 | - | - |

## 遇到的错误

| Error | Attempt | Resolution |
| --- | --- | --- |
| 首轮内部线程按 `projectId` 建立，和文档“按步骤隔离”不一致 | Scrutiny Review 静态复核 | 改为进程内 `projectId + stepKey` 对话线程，并补充验证剧情结构线程为空。 |

## 注意事项

- 不迁移 Aurora 的完整沙箱、工具桥和任务系统，只移植对话运行时的必要思想。
- 代码按后端运行时、对话服务、前端服务、状态和组件拆分。
- 完成后必须测试真实 OpenCode 对话。
