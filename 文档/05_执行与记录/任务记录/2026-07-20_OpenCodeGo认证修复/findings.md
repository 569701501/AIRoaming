---
doc_id: AIR-TASK-OPENCODE-GO-AUTH-FINDINGS-001
status: in_progress
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: 代码探索、OpenCode 官方文档、安全 auth 投影、真实差分请求
---

# OpenCode Go 认证映射修复发现

## 需求理解

用户已订阅 OpenCode Go，并授权修复 AI漫游内调用 `self/grok-4.5` 失败的问题。用户接受页面保持 `self/grok-4.5` 命名。

## 诊断证据

- 当前安全设置投影：`self/grok-4.5`，Base URL 为 `https://opencode.ai/zen/go/v1`，指纹存在。
- 当前受控 OpenCode 配置：自建 `airoaming_self`，适配器为 `@ai-sdk/openai-compatible`，模型为 `grok-4.5`。
- OpenCode auth 安全投影：`opencode-go` 有 API Key，`airoaming_self` 无 API Key。
- AI漫游当前路径真实返回 `401 Missing API key`。
- 同一 OpenCode 1.18.3 进程中，`opencode-go/grok-4.5` 真实返回 `OPENCODE_GO_OK`。
- OpenCode 官方文档明确 Go 全模型 ID 为 `opencode-go/<model-id>`，`grok-4.5` 的端点为 `/zen/go/v1/chat/completions`。

## 根因

2026-07-18 引入的“所有自定义 Base URL 都注册独立 `airoaming_<logicalId>`”规则对一般中转正确，但误伤了 OpenCode 自己的 Go 官方端点。Go 的凭据由 OpenCode 持久在内置 Provider `opencode-go`，自建 `airoaming_self` 既不会自动继承该凭据，服务重启后 AI漫游又只保留文本 Key 指纹，因此稳定进入无 Key 状态。

## 技术决策

- 以规范化后的官方 Go Base URL 作为明确识别信号。
- 逻辑 Provider 仍为 `self`，运行时 Provider 改为 `opencode-go`。
- 实施前进一步发现：OpenCode `/provider` 会列出内置 `opencode-go`，但当前 `/config` 不会；AI漫游 `listModels()` 现在以 `/config` 为可运行模型事实源。若完全不生成 managedProvider，修复认证后模型会从页面列表消失。
- 因此 Go 绑定继续生成不含密钥的 OpenAI-compatible managedProvider，但配置键改为 `opencode-go`；这一键同时作为 message providerID 和 auth 槽位，保持当前模型可见性，并复用 OpenCode 已持久的 Go 凭据。
- 认证同步继续使用现有 `/auth/{runtimeProviderId}` 路径；因此当设置请求携带 Key 时会自然写入 `/auth/opencode-go`。
- 一般自定义 Base URL 继续使用 `airoaming_<logicalId>`，防止回归 2026-07-18 已修复的 Grok 中转问题。

## 风险

- URL 识别过宽会把用户中转误当 Go；必须只匹配官方 origin + 固定 path，并容忍尾部斜杠。
- 若绕过应用设置显式选择其他模型，OpenCode 内置 Go 目录可见更多模型；本任务不扩大 UI 模型范围。
- 外部 OpenCode 版本过旧且无 `opencode-go` 时会失败；当前生产受控运行时为 1.18.3 且已验证内置 Provider 存在。

## 复核占位

- Scrutiny Review：未执行。
- Runtime/User Review：未执行。
