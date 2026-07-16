---
doc_id: AIR-TASK-20260716-SCRIPT-REAL-MODEL-FIX-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 代码、数据库、真实模型输出和浏览器证据
---

# 双流程真实模型验收修复发现

## 根因与证据

- AI pending：右侧 snapshot 已显示 `pendingSourceText`，但采用动作读取独立 `scriptPendingSuggestion`，局部 patch 导致短暂分裂；刷新后正常证明数据库写入本身无误。
- B2：严格契约要求 `excludedRanges[].sourceRange`，但 Prompt 主示例为空数组，真实模型沿用其他结构输出复数 `sourceRanges`。
- 静态复核发现 `category` 示例不能把全部枚举拼成带 `|` 的单个字符串；最终示例使用合法 `non_story`，完整闭集另列规则，避免模型照抄非法值。
- B4 误判：真实验证输出把原文“海雾压住崖城”归纳出的“压迫氛围”记入 `unsupportedAdditions`，说明 Prompt 未区分结构化标签与新增剧情事实。
- B4 真问题：真实输出出现“要求交出→阻止交出”的语义反转，以及“标签文字→人物对白”的载体变化；忠实度门应继续阻断。

## 最终数据证据

- 导入批次状态 `completed`。
- 第 1、2 章 item 均 `confirmed`，正式版本均 `origin=import`，pending=0。
- AI 项目生成后立即采用，Working Copy 5825 字符、`dirty`、pending=0。

## Scrutiny Review

结论：`passed`。

- 无 Schema/API/DTO/页面字段变化；事实源仍是数据库 pending、batch/item 和正式版本。
- 修复与双流程来源状态契约一致；测试覆盖原始竞态、字段形状和 Prompt 失败样例。
- 两个全量单测失败为并行负载下既有固定 5 秒 timeout，隔离复跑通过，不需要改无关备份逻辑。

## Runtime/User Review

结论：`passed_real_model`。

- 真实浏览器、新项目、真实 `self/gpt-5.5` 下两条路线均达到正式章节。
- AI 路线无需刷新即可采用。
- 导入路线一次确认目录后创建全部章节，用户自由切换、失败章单独重试、逐章确认，两章均可进入剧情结构。

## 残留风险

- 真实模型非确定性可能导致单章多次重试；这是严格保护原稿的预期成本。
- 导入 Worker 的多实例 lease 安全仍未实现。
- Server 全量并行运行有既有 5 秒超时稳定性债。
