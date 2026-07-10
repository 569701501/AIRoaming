---
doc_id: AIR-TASK-20260710-CLEAN-CANDIDATE-CONTRACT-PLAN
status: in_progress
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent
source: 用户要求、候选图整页化问题诊断、当前图片生成链路
---

# 候选图干净底图契约任务计划

## 目标

完成方案实现，使候选图稳定表达为“一个 shot 对应一张单幅、无文字、无气泡、无分格/边框的干净底图”，并正确使用 shot 相关参考资产与 provider 尺寸能力，为后续排版成稿画布提供可编辑输入。

## 非目标

- 未经用户再次确认，本轮不调用真实生图 API、不产生模型费用。
- 不实现排版成稿画布。
- 不把“一键整页漫画”混入 `Candidate.shotId` 语义；该能力如需要，后续在排版阶段单独设计。
- 不删除、覆盖或迁移用户已有候选图片。

## 强制验收标准

- 明确定义 Candidate 图片内容契约与禁止项。
- Prompt 事实源、预览、任务输入和后端执行不能继续漂移。
- 每个 shot 只注入与该 shot 相关的角色/场景参考，不再默认使用本章第一张角色设定图。
- Grok、OpenAI、豆包的生成/编辑参数差异有明确 adapter 计划和降级策略。
- 旧候选保留且可追溯，新旧生成规则可区分。
- 自动化测试能在不调用真实模型时拦截 chapter/dialogue/caption/page-layout 等污染。
- 真实生图验收覆盖三种镜头类型、三家 provider 的可用组合和失败证据记录。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| 1. 事实源与链路核对 | Orchestrator | completed | Prompt、参考图、provider、任务与资产追溯路径明确 |
| 2. 产物与任务契约设计 | Worker | completed | Candidate 内容契约和 GenerationSpec 明确 |
| 3. 参考图与 provider 方案 | Worker | completed | shot 级选择、多参考/降级、尺寸策略明确 |
| 4. 分阶段实施与测试计划 | Worker | completed | 文件范围、测试、迁移、回滚、验收顺序明确 |
| 5. 静态复核 | Scrutiny Review | completed | 方案与产品、任务协议、素材契约一致 |
| 6. 运行验收计划 | Runtime/User Review | completed | 无运行产物；已形成未来实现后的真实验收清单 |
| 7. 后端权威规格 | Worker | completed | 历史污染输入红测转绿，预览与执行共享同一规格 |
| 8. 镜头级引用与 provider 适配 | Worker | completed | 不再取全章首图，比例与多引用按 provider 安全处理 |
| 9. 前端接入与追溯 | Worker | completed | 前端不再拼权威 prompt，新候选带版本与任务证据 |
| 10. 实现静态复核 | Scrutiny Review | completed | 完整测试、类型检查、文档与 Handoff 通过 |
| 11. 实现运行复核 | Runtime/User Review | in_progress | 首批真实 Grok 样本部分通过；修复场景参考污染后复测 |

## 关键问题

1. Prompt 应在前端拼装、共享包拼装，还是由后端生成并向前端提供预览？
2. provider 只支持单参考图时，多角色 shot 如何降级且不引入错误角色？
3. 旧的整页候选如何保留、标识并避免被误锁为画格底图？
4. 如何在不调用模型的自动化测试中验证“干净底图契约”？
5. 真实生图测试需要多少样本才足以放行，而不把随机波动误判为修复完成？

## 退出标准

- 实现与正式方案一致，完整方案在实现稳定后转为 `accepted`。
- `findings.md` 记录事实、取舍、风险与静态复核。
- `progress.md` 记录阶段推进和 Handoff。
- 会话记忆与长期记忆更新。
- 不调用付费真实生图 API；运行复核由用户确认后执行。
