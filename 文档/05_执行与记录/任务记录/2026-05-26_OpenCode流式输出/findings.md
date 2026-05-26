# 发现与决策

---
doc_id: AIR-TASK-20260526-OPENCODE-STREAM-FINDINGS
status: completed
created: 2026-05-26
updated: 2026-05-26
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `文档/04_方案与决策/2026-05-25_OpenCode对话运行时移植方案.md` | 前端只应消费 AI漫游标准 `dialogue.*` 事件。 |
| `apps/server/src/ai-runtime/opencode-runtime.service.ts` | 当前只使用同步 `/session/{id}/message`。 |
| `apps/web/src/stores/workbench-store.ts` | 当前发送后一次性替换 `dialogueThread`。 |

## OpenCode 事件形状

生成过程中可观察到：

```json
{
  "type": "message.part.delta",
  "properties": {
    "sessionID": "ses_xxx",
    "messageID": "msg_xxx",
    "partID": "prt_xxx",
    "field": "text",
    "delta": "增量文本"
  }
}
```

完成时还会出现 `message.part.updated` 和 `session.idle`。本次实现以 `message.part.delta` 作为流式文本来源，以同步 `/message` 最终响应校准 completed 内容。

## 验证证据

| 证据 | 结论 |
| --- | --- |
| `corepack pnpm --filter @airoaming/shared build` | 通过 |
| `corepack pnpm --filter @airoaming/server build` | 通过 |
| `corepack pnpm --filter @airoaming/web build` | 通过 |
| 独立后端 `4321` 流式接口测试 | 收到 14 个 `dialogue.message.delta` |
| 当前页面代理 `4310` 流式接口测试 | 收到 6 个 delta，最终内容为 `当前页流式可用` |
| 读取 `story_structure` 线程 | 消息数为 0，步骤隔离生效 |

## 风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 暂未支持停止生成 | 用户关闭页面时 OpenCode 可能继续跑完 | 后续补 stop/cancel 接口 |
| 流式接口使用 POST SSE | 不能直接用浏览器 EventSource | 前端使用 fetch + ReadableStream |
