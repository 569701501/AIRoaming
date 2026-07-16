---
doc_id: AIR-TASK-20260716-STORYBOARD-S2-HANDOFF
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、实现与验收证据
---

# Handoff

## 交付结论

S2 已完成。用户在分镜页明确要求生成或调整草稿后，新 AI 输出必须依次通过：

```text
严格输出契约
→ 高确定性固定质量门
→ 当前已确认 StoryStructure 引用映射
→ 保存待确认草稿
```

任一环节首次失败时，只允许一次定向修复；修复后仍失败则返回失败，不新建或替换 pending。

## 主要改动

- `storyboard-quality.util.ts`：新 AI 输出严格契约与固定质量门。
- `dialogue-json.util.ts`：新分镜产出在兼容 normalize 前执行严格契约。
- `dialogue-prompt.util.ts`：增加仅针对校验失败的分镜修复 Prompt。
- `storyboard-dialogue.service.ts`：接入一次修复总预算，确保 pending 只在完整校验通过后写入。
- fake provider 从当前剧情结构 JSON 动态产生分镜回应，并提供“首次故意漏 beat”的隔离验收模式。

## 不变边界

- 不改页面展示字段。
- 不改 Storyboard payload 或数据库 Schema。
- 不新增用户确认节点或公开 Skill。
- 不改“用户明确生成→待确认草稿→用户确认→正式分镜”流程。
- 旧分镜数据仍使用兼容 normalize 读取。

## 验证摘要

- 聚焦单元/Service：4 files / 25 tests。
- Server 单进程全量：112 files / 677 tests。
- workspace typecheck、E2E typecheck、production build 通过。
- 聚焦 W1 + S2 Chromium：4/4。
- 完整 DB Chromium 矩阵：13/13。
- 全程使用 loopback fake-provider，真实文本/图片 provider 调用为 0。

## 回滚边界

S2 为独立改动。回滚时可移除严格契约、质量门、修复 Prompt 和 Service 编排，不影响已完成的 S1 引用/版本接线与 P06/P23～P26。
