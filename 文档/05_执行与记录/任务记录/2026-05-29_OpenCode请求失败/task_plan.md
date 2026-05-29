# OpenCode 请求失败诊断任务计划

---
doc_id: AIR-TASK-2026-05-29-OPENCODE-REQUEST-FAILED-PLAN
status: in_progress
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 用户反馈“请求失败了 Opencode”
---

## 1. 目标

定位 OpenCode 请求失败原因，并恢复项目对话默认可用。

## 2. 非目标

- 不修复上游 provider 的账号池。
- 不新增完整模型管理 UI。
- 不改剧本灵感、大纲和章节写入业务流程。

## 3. 阶段

| 阶段 | 状态 | 退出标准 |
| --- | --- | --- |
| 服务探测 | completed | 确认 AI漫游后端、OpenCode serve 和模型列表状态 |
| Provider 直连 | completed | 拿到默认 provider 的真实上游错误 |
| 默认模型修复 | completed | 默认模型指向当前可用 provider |
| 验证收口 | completed | typecheck 和真实对话 API 冒烟通过 |

## 4. 退出标准

- 明确根因。
- 默认对话链路不再使用已知失败的 provider。
- 文档记录可覆盖默认模型的环境变量。
