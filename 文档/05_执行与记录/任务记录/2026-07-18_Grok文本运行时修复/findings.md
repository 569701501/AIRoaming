---
doc_id: AIR-TASK-GROK-RUNTIME-FINDINGS-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 代码探索、运行日志、中转最小请求、OpenCode 官方配置约定
---

# Grok 文本运行时修复发现

## 需求理解

用户已经在现有中转账号开放 `grok-4.5`，要求继续修复 AI漫游内切换 Grok 后无法对话的问题。

## 证据

- 项目真实 Grok 凭据请求中转 `/v1/models` 返回 `grok-4.5`。
- 同一地址、同一凭据直接请求 `/v1/chat/completions` 返回 `OK`，响应模型为 `grok-4.5-build`。
- AI漫游 `/api/ai-runtime/models` 通过 fallback 显示 `xai/grok-4.5`。
- 运行中 OpenCode `/config` 的 `provider.xai` 为空，Grok Provider/模型列表为空。
- OpenCode 最小消息请求返回 HTTP 500，日志为 `ProviderModelNotFoundError`；请求未到达中转。

## 当前结论

- 上游开放、地址、密钥和模型均正常。
- 根因是 AI漫游只同步了 OpenCode auth、没有把用户保存的自定义 Base URL 和模型转成 OpenCode Provider 配置；该问题已修复。
- 页面 fallback 混淆了“用户已配置”和“运行时已注册”两个状态；不可运行 fallback 已移除。
- OpenCode 保留 ID `xai` 会走其内置 xAI 适配器，无法正确表达当前 OpenAI-compatible 中转；使用独立 `airoaming_xai` 后可稳定运行。
- 动态修改运行中 `/config` 不能作为可靠持久配置来源；AI漫游必须在自己管理的 OpenCode 启动时注入 Provider 配置，配置签名变化时重启自己的子进程。
- 文本与图片凭据完全相同时，冷启动可以按相同 Base URL 和指纹从 SecretStore 恢复；不相同时不得跨用途复用。

## 风险

- 直接写全局用户 `~/.config/opencode` 会污染其他项目，必须使用 AI漫游受控运行时配置。
- 把密钥写入 `OPENCODE_CONFIG_CONTENT` 会扩大秘密暴露面；Provider 配置与 auth 必须分离。
- 运行中的 OpenCode 是否支持动态配置刷新需要用回归证据确认；若不支持，必须由 AI漫游安全重启自己管理的实例。
- 当前 4396 OpenCode 已运行，修复时不能误杀用户手工启动的其他 OpenCode 进程。

## 复核占位

- Scrutiny Review：通过；配置与 auth 分离、逻辑/运行时 ID 边界、外部 OpenCode 边界和测试证据均符合任务约束。
- Runtime/User Review：通过；真实受控 OpenCode、真实新项目对话和删除 auth 后冷启动均成功，未产生图片请求。
