---
doc_id: AIR-HANDOFF-IMAGE-PROMPT-BASELINE-001
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 图片 Prompt 离线固定基线任务
---

# Handoff

## 已完成

- 机器可读固定语料：`tests/fixtures/image-prompt/s4-baseline-v1.json`。
- 生产 builder 驱动的离线编译器和 CLI：`pnpm --filter @airoaming/server image:prompt:baseline`。
- 自动回归：3 个参考图、5 类候选镜头、15 个 provider profile。
- 可复用离线报告与真实视觉 A/B 模板。
- 生产 Prompt、页面、数据库、任务协议和确认流程保持不变。

## 当前结论

当前图片 Prompt 可以继续作为 S4 真实视觉测试基线；离线证据没有发现需要立即修改生产 Prompt 的问题。

## 下一步

只有用户明确授权 provider、模型和费用范围后，才执行 30 张真实图片验收：5 类候选镜头 × 3 个 provider × 2 张。执行时必须保存图片、任务 input/output、实际 used/omitted references、profile、尺寸和人工判定表。

## 快速验证

```bash
pnpm --filter @airoaming/server image:prompt:baseline -- --output <report.json>
pnpm --filter @airoaming/server vitest run src/projects/image-prompt-baseline.spec.ts --pool=forks --poolOptions.forks.singleFork=true
```
