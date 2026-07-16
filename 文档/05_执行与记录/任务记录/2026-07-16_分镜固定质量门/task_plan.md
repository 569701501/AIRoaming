---
doc_id: AIR-TASK-20260716-STORYBOARD-S2-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 分镜及后续提示词改造顺序 S2 与当前代码事实
---

# 分镜固定质量门 S2 任务计划

## 1. 目标

在分镜 AI 输出进入待确认草稿前，增加一组只判断高确定性错误的固定质量门。首次输出存在 JSON、字段、引用或质量问题时，使用同一个修复预算定向重做一次；第二次仍失败则失败关闭，不新增、不替换 pending。

## 2. 非目标

- 不评价艺术审美、商业节奏、镜头是否“足够高级”。
- 不增加评分字段、页面诊断面板、用户确认节点或数据库表。
- 不改 Storyboard/StoryStructure payload，不新增 Shot 字段。
- 不用默认值掩盖新的 AI 生产输出错误；但不破坏历史文件读取兼容。
- 不调用真实付费模型或图片 provider。

## 3. 固定检查范围

| 维度 | 高确定性规则 |
| --- | --- |
| 输出契约 | shots 非空；order 连续；必填对象、文本、数组、枚举和 durationMs 合法 |
| 引用 | beatId、sceneId、characterId 只引用当前已确认结构；说话角色引用合法 |
| 覆盖与顺序 | 每个 beat 至少一个 Shot；Shot 的 beat 顺序不得倒退 |
| beat/scene | beat 已绑定 scene 时，承接 Shot 必须使用同一 scene |
| 空壳与重复 | 核心动作、画面、构图、情绪、动态描述、promptDraft 不为空或占位；完全重复镜头不得交付 |
| comic/motion | 对话型镜头不能两端都无对话；漫画有对白时漫剧至少保留对应 voice line |
| promptDraft | 不泄漏对白原文，不包含字幕、气泡、整页分格、已知模型名或 provider 参数 |

## 4. 阶段

| 阶段 | 工作 | 退出标准 | 状态 |
| --- | --- | --- | --- |
| S2-0 | 代码与事实源盘点 | 明确生产入口、兼容 normalize 与写入边界 | completed |
| S2-1 | 严格输出契约 | 新 AI 输出不再由默认值掩盖缺失/非法字段 | completed |
| S2-2 | 固定质量门 | coverage/order/reference/required/duplicate/一致性规则形成纯函数 | completed |
| S2-3 | 一次修复编排 | 首次失败修复一次，第二次失败不写 pending | completed |
| S2-4 | 自动化与运行复核 | 正反夹具、Service、类型/构建、浏览器路径通过 | completed |
| S2-5 | 文档与交付 | Handoff、双 Review、完成记录和提交齐全 | completed |

## 5. 强制验收标准

1. 首次生成和调整 pending 共用同一质量门与一次修复预算。
2. JSON 解析失败、非法枚举、缺失字段、引用错误和质量错误总共只允许一次额外模型调用。
3. 修复后仍有问题时，页面得到失败结果；DB/file pending 都不创建或替换。
4. 历史读取 normalize 保持兼容；严格检查只作用于本轮 AI 新输出。
5. 不增加页面、Schema、字段、公开 Skill 或工作流步骤。
6. 固定测试至少覆盖：漏 beat、倒序、未知引用、beat/scene 不一致、空字段、非法枚举、重复镜头、对话不一致和 promptDraft 污染。

## 6. 回滚边界

- S2 作为一个独立可回滚提交；回滚不影响已经完成的 S1 和 P06/P23～P26。
- Validator 不修改输入，只返回问题或抛出类型化错误。
- pending 只在二次校验完全通过后写入。
