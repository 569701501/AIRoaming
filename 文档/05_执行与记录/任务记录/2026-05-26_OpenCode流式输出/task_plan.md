# 任务计划：OpenCode 流式输出

---
doc_id: AIR-TASK-20260526-OPENCODE-STREAM-PLAN
status: completed
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户请求：流式输出做一下
---

## 目标

在已有 OpenCode 对话最小闭环上增加流式输出，让剧本页左侧对话框可以边生成边展示 assistant 文本。

## 阶段列表

### 阶段 1：事实源与接口探测
- [x] 读取项目入口、留痕规则和 OpenCode 移植方案。
- [x] 探测本机 OpenCode 事件流。
- **状态：** completed

### 阶段 2：后端流式协议
- [x] 增加 AI漫游对话流式事件 DTO。
- [x] 后端封装 OpenCode `/event` 增量事件。
- [x] 新增 `POST /messages/stream` SSE 接口。
- **状态：** completed

### 阶段 3：前端流式消费
- [x] 前端 API 使用 fetch 读取 SSE 响应。
- [x] Pinia store 增量更新 assistant 消息。
- [x] UI 保持发送中、失败和完成状态清晰。
- **状态：** completed

### 阶段 4：验证与复核
- [x] 构建 shared/server/web。
- [x] 用 API 验证可以收到 `dialogue.message.delta`。
- [x] 检查仍按 `projectId + stepKey` 隔离。
- **状态：** completed

### 阶段 5：文档留痕
- [x] 更新 OpenCode 方案、核心数据模型、模块总览、AI 上下文入口。
- [x] 新增功能完成记录。
- **状态：** completed

## 已做决策

| Decision | Rationale |
| --- | --- |
| 使用 `POST /messages/stream` 返回 `text/event-stream` | 发送对话需要请求体，前端用 fetch 流式读取即可。 |
| 前端只消费 `dialogue.*` 事件 | 避免绑定 OpenCode 原始事件结构。 |
| 保留同步 `/messages` 接口 | 作为兼容和回退，不破坏已验证链路。 |

## 风险

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| OpenCode delta 与最终 response 可能有轻微竞态 | 最终内容不完整或重复 | 以最终 `/message` 响应校准 completed 内容。 |
| 客户端断开后 OpenCode 仍在生成 | 暂时无法停止模型调用 | 本次只做流式展示，停止生成单独实现。 |
