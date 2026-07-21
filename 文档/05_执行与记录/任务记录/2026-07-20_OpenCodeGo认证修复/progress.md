---
doc_id: AIR-TASK-OPENCODE-GO-AUTH-PROGRESS-001
status: in_progress
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# OpenCode Go 认证映射修复进度

## 2026-07-20 Orchestrator

- 已读取文档入口、AI 上下文、写作规范、OpenCode 对话运行时方案和 2026-07-18 Grok 文本运行时修复记录。
- 已建立差分反馈环：`airoaming_self/grok-4.5` 返回 `401 Missing API key`；同进程 `opencode-go/grok-4.5` 返回 `OPENCODE_GO_OK`。
- 已确认任务不改 UI、DB Schema 或密钥存储，只修正 Go 官方端点的 runtime Provider 选择。
- Worker A 前置检查发现：内置 `opencode-go` 存在于 `/provider` 但不在当前 `/config`；为避免修复后模型列表消失，方案调整为以 `opencode-go` 作为 managed config/auth/message 的共同键，而非完全取消 managed config。
- 下一步：进入 Worker A，先写回归测试并观察红灯。

## Handoff

- 核心代码：`apps/server/src/ai-runtime/opencode-runtime.service.ts`。
- 正确测试缝：`apps/server/src/ai-runtime/opencode-runtime.service.spec.ts`，要求 auth 路径、message providerID、模型列表映射三者一致。
- 安全约束：测试只使用假 Key；真实验证不输出密钥。

## 2026-07-20 Worker A：失败回归

- 在 `opencode-runtime.service.spec.ts` 新增官方 Go 用例，同时断言模型列表逻辑 ID、auth 路径和 message runtime providerID。
- 现有 xAI 中转用例继续作为非 Go 自定义地址的回归保护。
- 红灯结果：定向 5 项中 4 通过、1 失败；Go 用例期望 `self/grok-4.5`，实际得到空列表，与旧 binding 试图查找 `airoaming_self` 一致。
- 下一步：Worker B 实现官方 Go URL 到 `opencode-go` 的定向 binding。
