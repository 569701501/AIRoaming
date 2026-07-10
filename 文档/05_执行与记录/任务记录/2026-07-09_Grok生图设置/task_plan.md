# Grok 生图设置任务计划

---
doc_id: AIR-TASK-20260709-GROK-IMAGE-PROVIDER-PLAN
status: completed
created: 2026-07-09
updated: 2026-07-09
owner: AI漫游项目
audience: human, ai-agent
source: 用户要求、xAI 官方文档、AI漫游现有图片 provider 实现
---

## 目标

在设置页“图片生成”中新增 Grok 生图服务商配置，并让候选图/角色图/场景图继续通过现有串行队列一个一个生成。

## 非目标

- 不接 Grok 视频。
- 不改变 OpenCode 对话模型配置。
- 不把真实 API Key 写入文档、Git 或任务输出。
- 不新增并发生成。

## 阶段

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1. 事实源与任务留痕 | completed | 读取文档、代码、建立任务记录 |
| 2. API 行为核验 | completed | xAI 官方文档确认 OpenAI 兼容 `/v1/images/generations` |
| 3. 代码实现 | completed | 扩展共享 DTO、后端设置、provider 分支、前端设置页 |
| 4. 文档与完成记录 | completed | 更新生成任务协议、任务记录、完成记录、长期记忆 |
| 5. 验证 | completed | typecheck / 测试 / 关键词检查 |

## 验收标准

- 设置页图片生成下拉中可选 `Grok 图片生成`。
- Grok 配置有独立的 providerName/modelId/baseUrl/apiKey 表单。
- 后端能持久化并公开非敏感 Grok 配置状态。
- `activeImageProvider = grok` 时 `ImageProviderService` 使用 OpenAI 兼容请求分支调用 Grok 中转。
- `image_generate` 仍由 `ImageCandidateService.runTaskSerialized` 串行执行。
- 类型检查通过；如测试无法完全跑通，必须说明原因。

## 当前深思熟虑角色边界

- Orchestrator：建立任务和阶段。
- Worker：实现代码、文档和验证。
- Scrutiny Review：检查 provider 类型、兼容迁移、队列串行和密钥不泄露。
- Runtime/User Review：代码级验证已完成；真实 Grok 中转出图需要用户在设置页填入自己的中转 URL/API Key 后用真实项目试生成。
