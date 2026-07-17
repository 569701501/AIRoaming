---
doc_id: AIR-TASK-20260717-STORYBOARD-SEMANTIC-CORPUS-PLAN
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 分镜 Beat 语义评测真实样本扩充需求
---

# 分镜语义固定样例集任务计划

## 目标

为现有 QA-only 分镜 Beat 语义评测器建立一套可追踪、可重复运行的固定样例集，覆盖不同题材、Beat 密度、事实类型和 `covered | partial | missing | contradicted` 四态；提供串行重复运行与预期对比汇总，帮助判断评测器稳定性，并为下一轮 Prompt 实验提供固定基线。

## 非目标

- 不修改当前生产分镜 Prompt V2.3。
- 不恢复或改造已回滚的 V2.4。
- 不接入分镜生成、用户确认、自动修复、页面或数据库。
- 不新增 StoryStructure、Storyboard、DTO 或正式业务字段。
- 不调用图片、视频、TTS、字幕或其他付费媒体服务。
- 不用固定样例结果直接证明某个生产 Prompt 一定更优。

## 冻结边界

1. 样例同时保存 StoryStructure、Storyboard 和人工预期报告，全部为仓库内固定夹具。
2. 样例必须覆盖至少 4 类题材或叙事形态、不同 Beat 数量，以及动作、声音、屏幕信息、身份、对白选择和状态变化等事实。
3. 整体样例集必须覆盖四种语义状态，并至少包含一套全部完整的对照样例。
4. 样例加载失败、Beat 不一致、非法镜头证据或预期报告不符合现有严格契约时直接失败。
5. 真实模型批量运行按样例、按轮次串行执行；单个契约失败应被记录，其他样例继续运行。
6. 汇总同时报告与人工预期的一致度和多轮模型自身稳定度，不把一次模型输出当作真值。
7. 所有运行结果只进入任务证据或调用方指定文件，不写业务数据库。

## 阶段

| 阶段 | 角色 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| C0 契约与覆盖矩阵 | Orchestrator | completed | 样例范围、非目标、验收口径冻结 |
| C1 测试先行 | Worker | completed | 样例契约、比较和汇总的红灯证据成立 |
| C2 样例与批量入口 | Worker | completed | 固定样例集、严格加载器和串行 CLI 完成 |
| C3 确定性验证 | Worker | completed | 定向测试、类型检查、构建通过；全仓并发已知超时完成隔离归因 |
| C4 真实模型校准 | Runtime/User Review | completed | 固定样例完成至少两轮串行文本评测并形成稳定性结论 |
| C5 收口 | Scrutiny Review | completed | 双 Review、Handoff、完成记录、长期记忆和提交完成 |

## 验收标准

- 固定样例不少于 5 个，覆盖至少 4 类题材或叙事形态。
- 样例 Beat 数量有差异，并覆盖动作、声音、屏幕信息、身份、对白选择与状态变化。
- 人工预期合计覆盖 `covered`、`partial`、`missing`、`contradicted` 四态。
- 严格加载器拒绝重复样例、错位 Beat、非法证据和未知字段。
- 批量 CLI 支持 `--dry-run`、`--repeat`、串行真实运行、结果落盘和失败留痕。
- 汇总能计算逐维度预期一致率、逐样例一致率和重复运行稳定率。
- 真实文本模型至少运行两轮；如模型服务不可用，需保留完整失败证据和可复现命令，不能伪造结果。
- 生产分镜 Prompt、页面、Schema、DTO、数据库和媒体任务均无变化。

## 回滚

全部新增内容限定为 QA-only 样例、加载/比较工具、批量 CLI、测试和文档；删除对应文件与 package script 即可回滚，不涉及数据迁移或历史产物。

## 最终判定

`completed_with_model_variance_and_known_unrelated_test_stability_debt`

固定样例集、严格契约、批量入口、真实文本模型校准和双 Review 均完成。抽象关系状态仍有模型边缘判断，必须继续采用重复评测与人工复核；全仓并发下一个无关备份用例固定 5 秒超时，隔离和完整文件均通过，本任务不修改该测试。
