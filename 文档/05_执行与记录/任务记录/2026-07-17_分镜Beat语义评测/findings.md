---
doc_id: AIR-TASK-20260717-STORYBOARD-BEAT-SEMANTIC-EVAL-FINDINGS
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 生产代码、V2.3 A/B 与现有质量门
---

# 分镜 Beat 语义评测发现

## 当前事实

1. `assertStoryboardQuality` 能证明 beatId 已覆盖，但不能证明 `summary/outcome` 的事件、因果和状态变化进入镜头。
2. V2.3 AI 样本正好提供固定反例：`beat_01` 引用存在，但旧机器刹车声没有明确表达。
3. 当前生产每章最多两个 Shot/Beat，按 beatId 聚合后的语义证据规模较小，适合单独评测。
4. 现有 OpenCode 文本运行时已经具备 deny-all 权限、模型选择和超时治理，QA CLI 应复用而不是直接复制 HTTP 调用。

## 决策

- 评测是离线 QA 能力，不是生成后的自动门禁。
- 模型只输出逐 Beat 事实判断；总状态本地派生。
- Prompt 只提供能表达剧情事实的字段，不提供构图、运镜枚举、promptDraft 或项目背景，减少审美干扰。

## 风险

- 模型语义判断有波动，单次结果不能替代用户确认。
- `partial` 与 `missing` 边界需要用固定样例校准。
- 输入很长时仍会增加文本成本，但 QA 工具只按需运行，不影响正常用户生成。

## 真实评测结果

固定模型为 `self/gpt-5.5`，AI 创作和已有剧本导入样本各重复运行两次。

| 样本 | 两次维度统计 | 两次都出现的非完整 Beat | 结论 |
| --- | --- | --- | --- |
| AI 创作 V2.3 | 均为 20 covered / 6 partial / 0 missing / 0 contradicted | `beat_01`、`beat_02`、`beat_05`、`beat_06` | 4/4 问题稳定复现 |
| 导入 V2.3 | 12/4/0/0 与 10/6/0/0 | `beat_02`、`beat_04` | 核心问题稳定；第二次额外标记 `beat_06`、`beat_08` |

AI 样本稳定识别了任务验收反例：`beat_01` 虽有合法 beatId 和镜头，但站务电话失联与“旧机器刹车声引向站台尽头”未被明确表现。导入样本稳定识别了“蓝门仓库”线索关联和许岚证人身份/林澈分散追兵目标表达不足。

## 最终结论

1. beatId 全覆盖只能证明结构挂载，不能证明 summary/outcome 语义已进入镜头。
2. 严格本地 parser 能拒绝额外字段、漏/乱序 Beat 和跨 Beat 镜头证据；模型不拥有总状态决定权。
3. 模型在核心问题上有稳定性，但边缘 `partial` 会波动。后续做 Prompt A/B 时应优先比较重复评测的交集，不把单次 warning 自动转为生成失败。
4. V2.3 仍是生产基线。本任务只新增测量能力，不据此静默修改分镜 Prompt 或正式产物。
