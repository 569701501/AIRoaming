---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V23-SCRUTINY
status: passed_with_observation
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 生产差异、测试和 A/B 静态证据
---

# Scrutiny Review

## 结论

`passed_with_observation`

没有阻断发布的问题。实现范围与任务冻结边界一致。

## 复核要点

| 项目 | 结论 |
| --- | --- |
| 事实源 | 服务继续按 StoryVersion 的精确 `sourceScriptVersionId` 读取正式章节正文 |
| 候选职责 | 候选是 Prompt 本地只读引用，不产生数据库事实或正式 ID |
| 同源校验 | Prompt 和固定质量门使用同一次编译结果，避免上下文与验证分叉 |
| 兼容性 | 固定 Markdown 即使无对白也启用空集合硬门；历史纯文本解析失败则明确降级 |
| 修复次数 | 解析、既有质量和新增来源问题共用一次修复，没有隐式增加模型重试 |
| 下游影响 | Storyboard 字段、DTO、Schema、确认和出图流程均未改变 |
| 测试 | 新候选、长稿中段、来源错误、修复、服务接线与现有质量门均有覆盖 |

## 非阻断观察

- `sourceSpeaker.includes(character.name)` 是称谓/动作前缀的实用映射，不承担正式实体解析；无法识别时保持 `characterRef=null`，后续正式角色引用仍由已有 resolver 校验。
- 有声音证据的引号提取使用局部上下文启发式，可能多收候选，但不会允许正文中不存在的台词。
- 长对白章节 Prompt 会增大；当前真实运行通过，后续应以多样例监控，不应本轮引入截断并重新制造中段不可见。
- 语义事件覆盖仍是软问题，不能仅凭字符串或 beatId 做高确定性阻断。
