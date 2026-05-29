# OpenCode 请求失败诊断进展

---
doc_id: AIR-TASK-2026-05-29-OPENCODE-REQUEST-FAILED-PROGRESS
status: active
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: task_plan.md
---

## 2026-05-29

### 已采取操作

- 读取长期记忆和 OpenCode 运行时方案。
- 探测 `GET /api/health` 和 `GET /api/ai-runtime/models`：均正常。
- 直连 OpenCode `/session`：成功。
- 直连 OpenCode `/session/{id}/message` 使用默认模型：超过 60 秒无响应，诊断脚本 abort。
- 直连默认 provider `timicc`：返回 `503 No available accounts: no available accounts`。
- 直连备用 provider `self/gpt-5.5`：成功返回“正常”。
- 将 AI漫游默认模型兜底改为 `self/gpt-5.5`，并让前端加载模型列表时采用后端当前默认。

### 验证

| 验证项 | 结果 |
| --- | --- |
| `corepack pnpm --filter @airoaming/shared typecheck` | 通过 |
| `corepack pnpm --filter @airoaming/server typecheck` | 通过 |
| `corepack pnpm --filter @airoaming/web typecheck` | 通过 |
| `GET /api/ai-runtime/models` | 通过：`defaultModel = self/gpt-5.5` |
| 临时项目对话 API 冒烟 | 通过：assistant `completed`，模型为 `self/gpt-5.5`，回复“正常” |

### Handoff

默认 provider 已切到可用的 `self/gpt-5.5`；如果其他机器没有该 provider，需要通过环境变量指定本机可用模型。
