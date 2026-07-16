---
doc_id: AIR-TASK-20260716-DUAL-STORYBOARD-PROMPT-REAL-AB-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户授权、V1 基线、双轨 Prompt V2 与真实模型运行环境
---

# 漫画 / 漫剧双轨分镜 Prompt V1/V2 真实 A/B 任务计划

## 目标

使用真实 `self/gpt-5.5`，分别以 AI 创作和完整剧本导入创建一个全新逻辑项目；每个项目在正式 ScriptVersion 与 StoryVersion 确认后冻结并复制成 V1/V2 两套隔离运行库，使同一路线只有分镜 Prompt 不同，比较真实分镜生成质量。

## 非目标

- 不调用图片、视频、TTS 或字幕 provider。
- 不修改页面、Schema、数据库协议、正式 Prompt 或质量门。
- 不用四个不同故事冒充 A/B；同一路线必须使用相同正式输入。
- 不把一次两样例结果表述为跨题材稳定率。
- 不用同一模型的主观总分替代确定性指标和人工逐镜复核。

## A/B 隔离设计

```text
AI 创作项目 ─┐
              ├─ 正式结构确认后的基线数据库 ─┬─ V1 Prompt / 新模型会话
导入剧本项目 ─┘                              └─ V2 Prompt / 新模型会话
```

- V1 代码基线：`c3fe684`，即双轨 Prompt 实施前的生产版本。
- V2 代码基线：`5551271` 及其后仅文档提交，生产 Prompt 内容不变。
- 模型：`self/gpt-5.5`。
- 触发语：两侧统一为“请生成当前章节完整分镜，漫画和漫剧都要完整。”
- 两侧使用独立 Conversation Session，避免上下文继承。
- 基线项目创建完成后再复制 SQLite 与 workspace，保证正文、结构和版本 ID 一致。
- V1 与 V2 页面分别保持可访问，等待用户查看后再关闭。

## 固定评价指标

### 确定性指标

1. 首次 JSON / 固定质量门是否通过。
2. 是否触发一次修复及修复结果。
3. beat 覆盖率、未知/倒序引用、scene/beat 不一致。
4. 无来源剧情、对白或人物。
5. `promptDraft` 禁止内容。
6. Shot 总数与 Shot/beat。

### 漫画轨道

1. 静态决定性瞬间是否单帧可画。
2. 是否把多个连续动作塞入一个画格。
3. 阅读动线、构图重点和气泡留白是否具体。
4. 相邻画格的位置、道具和动作结果是否连续。

### 漫剧轨道

1. 是否明确开始状态、主要动作/表演/信息变化、结束状态。
2. 是否只是换词复述 `comic.panelDescription`。
3. 运镜是否有叙事用途，时长是否容纳动作/台词/反应。
4. 相邻镜头尾首帧、运动方向、道具和动作完成状态是否连续。

### 双轨边界

1. 正式事实是否一致且不冲突。
2. 两轨是否形成媒介差异，而不是主从投影。
3. 是否因 V2 增加无必要镜头或降低漫画可读性。

## 判定口径

- `V2_ACCEPTED`：两条路线硬门均通过，且 V2 在漫剧独立性/时间过程上均明显改善，漫画和事实忠实性不退化。
- `MIXED`：只在一路改善、指标互相抵消，或质量差异不足以排除模型随机性。
- `V2_REJECTED`：任一路出现无来源事实、正式冲突、明显连续性退化，或固定门稳定性显著下降。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| AB0 事实与环境 | Orchestrator | completed | 基线、样例、指标、端口、隔离与回滚明确 |
| AB1 两项目基线 | Worker | completed | AI/import 项目均形成正式 ScriptVersion 与 StoryVersion |
| AB2 数据分叉与双环境 | Worker | completed | V1/V2 读取相同项目输入，图片 worker 关闭 |
| AB3 双路线真实生成 | Worker | completed | 四次分镜输出及修复链有完整证据 |
| AB4 对比与静态复核 | Scrutiny Review | completed | 指标、逐镜证据和结论可追溯 |
| AB5 页面与用户复核 | Runtime/User Review | completed | 两套页面保持可查看，状态和控制台证据完成 |

## 退出标准

- 两个逻辑项目、四个 A/B 输出完整。
- V1/V2 的模型、输入版本、触发语和运行边界一致。
- 结论使用 `V2_ACCEPTED / MIXED / V2_REJECTED`，不夸大样本范围。
- Handoff、双 Review、完成记录、正式方案状态和长期记忆完成。
- 隔离环境地址交付用户，未经用户查看不主动删除数据库。
