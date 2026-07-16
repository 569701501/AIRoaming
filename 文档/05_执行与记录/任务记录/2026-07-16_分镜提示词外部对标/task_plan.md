---
doc_id: AIR-TASK-20260716-STORYBOARD-PROMPT-BENCHMARK-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求、当前分镜 Prompt 与公开外部来源
---

# 分镜提示词外部对标任务计划

## 目标

把 AI漫游现有 `storyboard-shot-generate` 与 GitHub 热门开源项目、成熟分镜平台和公开 Prompt 方法逐项比较，形成可追溯的 V2 取长补短方案。

## 非目标

- 本轮不直接修改生产 Prompt、Schema、页面字段或确认流程。
- 不按 Star 数量把任意仓库当作质量证明。
- 不复制来源中的整段受版权保护文本、艺术家名、第三方 IP 或供应商私有参数。
- 不把视频分镜的固定 16:9、秒级切镜和镜头运动机械套给漫画画格。
- 不把主观审美评分直接变成后端硬门。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| R0 当前基线 | Orchestrator | completed | 当前 Prompt、数据字段、质量门与真实模型证据明确 |
| R1 外部来源 | Worker | completed | 每项来源标明热度、可见证据、可借鉴项与限制 |
| R2 差距与方案 | Worker | completed | 完成保留/增强/拒绝矩阵和 V2 模块草案 |
| R3 复核与留痕 | Scrutiny Review | completed | 来源可追溯、推断有标识、方案不破坏当前流程 |

## 验收标准

1. 至少覆盖三类来源：开源漫画/故事板项目、成熟分镜平台、提示词/评测方法。
2. 清楚区分完整 Prompt、代码字段/工作流、产品说明和推断，不混为一谈。
3. 对现有 Prompt 每个主要模块给出 `保留 / 增强 / 拆分 / 不采用` 结论。
4. V2 不改变当前 Storyboard 页面字段和“生成 pending → 用户确认 → 正式版本”流程。
5. 明确哪些改动属于 Prompt，哪些应属于确定性质量门，哪些暂时只做软评测。
6. 给出实施优先级和固定测试样例建议，用户确认后才能进入生产改造。

## 退出标准

- 正式调研与适配判断文档完成。
- Handoff、Scrutiny Review 和“不适用的 Runtime/User Review”原因完成。
- 会话记忆和长期有效结论已同步。

## 最终结论

- 推荐保留当前 Prompt 骨架，新增内部镜头决策层，不导入外部完整 Skill。
- V2 第一版不改页面、Schema、输出字段、公开 Skill 和确认流程。
- 生产修改必须等用户确认，并先运行旧版/V2 同模型 A/B。
