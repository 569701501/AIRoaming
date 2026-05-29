# OpenCode 请求失败诊断发现

---
doc_id: AIR-TASK-2026-05-29-OPENCODE-REQUEST-FAILED-FINDINGS
status: active
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 代码和本地运行时探测
---

## 1. 根因

默认模型链路 `aurora/gpt-5.4` 实际指向 timicc provider。该 provider 当前返回：

```text
503 No available accounts: no available accounts
```

因此 OpenCode 请求失败不是 AI漫游前端问题，也不是 OpenCode serve 没启动，而是默认 provider 上游没有可用账号。

## 2. 证据

- OpenCode `/config` 能返回 provider 和模型列表。
- OpenCode `/session` 能创建 session。
- 直连 timicc `/v1/chat/completions` 返回 503。
- 直连 `self/gpt-5.5` 返回 200，并生成“正常”。

## 3. 处理

- 后端默认模型兜底改为 `self/gpt-5.5`。
- `.env.example` 增加 `OPENCODE_PROVIDER_ID=self` 和 `OPENCODE_MODEL_ID=gpt-5.5`。
- 前端模型加载不再保留旧选中模型，改为采用后端当前默认。
- 验证后 `GET /api/ai-runtime/models` 返回 `defaultModel = self/gpt-5.5`，临时项目对话 API 使用 `self/gpt-5.5` 成功完成。
