---
doc_id: AIR-TASK-20260723-LAYOUT-OCCLUSION-PLAN
status: complete
created: 2026-07-23
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求检查真实漫画成稿预览中的文字遮挡
---

# 排版文字遮挡复核任务计划

## 目标

对真实章节漫画成稿预览的文字遮挡进行可重复复核，确认视觉分析是否实际运行、规则回退如何放置气泡、质量门为何放行，以及预览渲染是否忠实。

## 非目标

- 本轮不修改生产代码、数据库或当前 Working Copy。
- 不重新运行排版任务或外部视觉模型。
- 不把既有诊断记录直接当作本轮运行证据，关键结论必须重新核对。

## 当前阶段

阶段 4：只读诊断与复核已完成。

## 阶段

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 1 | 真实页面复现、截图与遮挡点定位 | complete |
| 2 | 当前 Working Copy 与最近任务数据核对 | complete |
| 3 | 凭据注入、规则 composer 与质量门代码核对 | complete |
| 4 | Scrutiny Review 与诊断交付 | complete |

## 验收标准

1. 页面证据能指明具体遮挡段落与被遮挡主体。
2. 当前文档坐标与预览坐标比对能排除或确认缩放故障。
3. 最近 layout 任务的 `analysisMode`、warning 和视觉分析数量有数据库或任务输出证据。
4. 设置页公开状态、运行时凭据与 `visualAnalysisProvider` 来源投影的差异有代码和运行证据。
5. fallback 放置规则与质量门误放行条件定位到具体实现。
6. 最终结论区分直接原因、系统根因和修复顺序。

## 退出标准

- 完成复现、数据核对和代码核对。
- Scrutiny Review 给出通过/不通过及残留风险。
- 更新会话记忆与长期记忆；本轮无功能实现，不新增功能完成记录。

以上退出标准已满足。本轮只完成诊断；修复、重新生成当前 Working Copy 和正式功能完成记录留待用户另行授权。

## 角色边界

- Orchestrator：限定为只读诊断，组织证据与假设。
- Worker：复现页面、读取数据库和代码，不写生产状态。
- Scrutiny Review：只读检查证据链是否完整。
- Runtime/User Review：由 AI 在隔离浏览器检查用户给出的真实页面；不操作用户浏览器。
