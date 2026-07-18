---
doc_id: AIR-TASK-GROK-RUNTIME-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户确认继续修复、Grok 请求失败诊断证据
---

# Grok 文本运行时修复任务计划

## 目标

让设置页保存的 OpenAI-compatible Grok 中转配置真正进入 AI漫游管理的 OpenCode 运行时，使 `xai/grok-4.5` 不仅在页面可见，而且能够完成项目对话。

## 非目标

- 不修改图片 Provider 或调用图片生成。
- 不把 API Key 写入项目文档、日志、数据库或仓库配置。
- 不重做模型管理页面，不扩展为多 Provider 凭证列表。
- 不改变对话、剧本、剧情结构或分镜的数据契约。

## 已知失败信号

```text
中转 /v1/models 与 /v1/chat/completions：成功
AI漫游模型列表：显示 xai/grok-4.5
OpenCode /config：provider.xai 为空
OpenCode message：HTTP 500 + ProviderModelNotFoundError
```

## 阶段

1. Orchestrator：读取事实源、冻结边界和回归信号。
2. Worker A：补充 Provider/模型注册失败回归测试。
3. Worker B：实现受控 OpenCode 配置同步和模型列表保护。
4. Worker C：执行单测、类型检查、构建和真实文本回归。
5. Scrutiny Review：只读复核代码、契约、测试和秘密处理。
6. Runtime/User Review：验证真实 OpenCode 与项目对话路径。

## 验收标准

- 设置中的 `providerId/modelId/baseUrl` 被转换为同一 OpenCode Provider 配置。
- 自定义中转使用 `@ai-sdk/openai-compatible`，模型显式注册到 `provider.models`。
- API Key 仍只通过 OpenCode auth 同步，不进入非秘密配置响应和日志。
- 模型列表不再把未注册 fallback 冒充为可运行模型。
- `xai/grok-4.5` 通过真实 OpenCode 文本请求并返回有效文本。
- AI漫游项目对话真实路径完成一次最小文本回归。
- 不产生图片调用费用。

## 退出标准

- 失败回归测试先失败、修复后通过。
- 相关单测、三包类型检查和生产构建通过。
- 原始 HTTP 500 复现不再出现。
- 静态复核与运行复核均有明确结论。
- 事实源、完成记录、会话记忆和长期记忆已同步。

## 当前角色边界

- 当前阶段：全部完成。
- 功能改动限定在 AI Runtime、Settings 的必要测试与实现，没有改动图片调用协议，也没有覆盖工作区中已有 Prompt/剧本工作流改动。
- Scrutiny Review 与 Runtime/User Review 均已完成，结论见同目录复核文档。
