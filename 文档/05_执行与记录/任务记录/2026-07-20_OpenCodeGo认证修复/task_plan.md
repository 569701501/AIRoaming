---
doc_id: AIR-TASK-OPENCODE-GO-AUTH-001
status: in_progress
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户授权修复、OpenCode Go 真实差分诊断
---

# OpenCode Go 认证映射修复计划

## 目标

保持设置页逻辑模型 `self/grok-4.5` 和现有设置数据不变，将 OpenCode Go 官方端点绑定到 OpenCode 内置 `opencode-go` Provider，消除当前 `airoaming_self` 认证槽位缺 Key 造成的 `401 Missing API key`。

## 非目标

- 不改造设置页为多文本 Provider 管理器。
- 不更改数据库 Schema、ProviderConfig 数据或页面显示名。
- 不把 API Key 写入仓库、文档、日志或 OpenCode 非秘密配置。
- 不影响其他官方 Provider 和普通自定义 OpenAI-compatible 中转。
- 不调用图片生成。

## 失败信号与根因

```text
AI漫游当前路径：self -> airoaming_self/grok-4.5 -> 401 Missing API key
官方差分路径：opencode-go/grok-4.5 -> OPENCODE_GO_OK
```

当前 OpenCode auth 有 `opencode-go` Key，无 `airoaming_self` Key；订阅、模型、网络与密钥本身均已排除。

## 阶段

1. Orchestrator：冻结边界、读取事实源、建立任务记录。
2. Worker A：在 OpenCodeRuntimeService 真实调用缝补先回归测试，覆盖官方 Go 映射和普通自定义地址不回归。
3. Worker B：实现官方 Go URL 识别与 runtime binding，保持逻辑 ID 不变。
4. Worker C：执行定向单测、类型检查、全量服务端回归和真实默认链路。
5. Scrutiny Review：只读复核代码、认证边界、回归证据和文档。
6. Runtime/User Review：验证 AI漫游默认 `self/grok-4.5` 经修复后返回有效文本，并核对 OpenCode 内部实际使用 `opencode-go`。

## 验收标准

- `https://opencode.ai/zen/go/v1` 及仅差尾部 `/` 的形式绑定 `opencode-go`。
- 页面与业务记录仍为 `self/grok-4.5`。
- Go 绑定不在 `OPENCODE_CONFIG_CONTENT` 中新建 `airoaming_self`；为保持现有 `/config` 模型列表契约，可在无密钥配置中以 `opencode-go` 键显式限定当前模型与官方 Base URL。
- 如果设置页刚提交了 Key，认证同步目标为 `/auth/opencode-go`；若当前内存无 Key，可继续使用 OpenCode 已持久的 `opencode-go` 凭据。
- 非 Go 的自定义 Base URL 继续映射为 `airoaming_<logicalProviderId>`。
- 定向测试、类型检查、服务端全量测试通过。
- 真实 AI漫游默认文本请求成功，不再出现 `401 Missing API key`。
- 无图片请求、无密钥泄漏、无调试残留。

## 回滚

修复限定为 `OpenCodeRuntimeService` 的 runtime binding 选择与其测试；回滚时删除 Go 特例即恢复旧行为，无数据迁移。

## 退出标准

- 所有阶段完成并有证据。
- Scrutiny Review 和 Runtime/User Review 均给出明确结论。
- OpenCode 运行时事实源、完成记录、会话记忆和长期记忆已同步。

## 当前角色边界

- 当前角色：Worker B。
- Worker A 已完成回归红灯；Worker B 只修改 OpenCode runtime binding，不扩大 UI、数据或密钥存储范围。
