---
doc_id: AIR-TASK-20260716-STORYBOARD-S2-RUNTIME
status: passed_isolated
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 新建隔离项目 Chromium 用户路径
---

# Runtime / User Review

## 结论

`passed_isolated`。新建项目的真实页面路径证明：分镜首次缺 beat 时会自动定向修复一次，修复通过后只形成待确认草稿，用户确认门未被绕过。

## 运行路径

1. 在独立 DB/workspace 中新建项目。
2. 通过页面完成章节生成、采用与“完成本章”。
3. 在剧情结构页明确生成并确认结构。
4. 进入分镜页，在对话框输入“生成分镜”。
5. fake-provider 第一次只返回第一个 beat，触发 coverage 门；唯一修复返回完整分镜。
6. 检查页面待确认镜头卡、确认按钮与后端状态。

## 断言结果

- fake-provider 收到分镜模型请求精确为 2 次：首次 + 唯一修复。
- 页面展示 3 张待确认镜头卡，并显示“确认分镜”动作。
- 后端 `pendingStoryboard` 存在，正式 `storyboard` 仍为空。
- 章节仍保持 `structured`，没有自动推进为 `storyboard_done`。
- 聚焦 W1 + S2 Chromium 4/4，完整 DB Chromium 矩阵 13/13。
- 最终调整页面语义断言后又独立复跑 S2 1/1，run ID `g0-7533-mrnihfv1-7f507a72`。

## 环境与边界

- 只使用本地 loopback fake-provider，没有真实付费文本模型或图片 provider 调用。
- 本证据证明用户路径、修复上限和持久化边界，不代表真实模型的节奏、审美或图片品质验收。
