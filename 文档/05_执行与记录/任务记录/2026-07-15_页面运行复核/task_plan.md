---
doc_id: AIR-TASK-20260715-PAGE-RUNTIME-PLAN
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户要求操作页面、允许断点并检查问题
---

# G0～G5 页面运行复核计划

## 目标

1. 在真实浏览器中操作 G0～G5 已完成页面，而不是只依赖 Vitest/Playwright 无头结果。
2. 检查页面可见状态、关键交互、刷新恢复、写入门禁、控制台错误和失败请求。
3. 若发现缺陷，按复现、定位、修复、回归顺序处理并保留证据。

## 非目标与边界

- 不进入 G6 素材包、G7 或轻量视频。
- 不调用真实 provider，不读取真实凭据。
- 不修改真实项目数据；使用临时 SQLite、临时 workspace 和 fake provider。
- 不删除 backup/archive，不执行 down migration，不回退 file-only。
- 不安排日期或工期；按页面依赖连续执行。

## 阶段

| 阶段 | 角色 | 工作 | 状态 | 退出标准 |
| --- | --- | --- | --- | --- |
| P0 | Orchestrator | 确认隔离环境、页面入口和检查矩阵 | completed | 临时运行边界明确 |
| P1 | Worker | 项目库、创建项目、流程栏和设置页冒烟 | completed | 导航和等待门禁正确 |
| P2 | Worker | G4 候选收藏/废弃/定稿/返修/历史 | completed | 影响确认和 fail-closed 正确 |
| P3 | Worker | G5 草稿、画布、文字、气泡、版本、出版、手机只读 | completed | 编辑与出版路径正确 |
| P4 | Worker | 对发现的问题使用断点、日志或请求检查定位并复测 | completed | 3 项页面链路缺陷已关闭 |
| P5 | Scrutiny Review | 只读复核代码/文档/测试证据 | completed | 结论 `passed` |
| P6 | Runtime/User Review | 汇总真实浏览器结果和截图 | completed | 结论 `passed_isolated` |
| P7 | Orchestrator | 更新进度、发现、完成记录与记忆 | completed | 留痕完整 |

## 页面检查矩阵

| 范围 | 主要检查 |
| --- | --- |
| 项目库 | 页面加载、空/有数据状态、创建表单、漫画版式必选、打开/返回 |
| 流程栏 | 7 步顺序、waiting 禁用、直接 URL、刷新恢复 |
| G4 | 收藏/废弃不改 current；定稿先预览；冲突不自动提交；历史可读 |
| G5 | 草稿初始化、模板/裁切、文字/气泡、保存恢复、来源预检、不可变版本、出版、手机只读 |
| 诊断 | console error、pageerror、失败请求、4xx/5xx、无响应控件、视觉遮挡/溢出 |

## 验收标准

- 关键页面由浏览器实际打开并执行交互。
- 每个阶段有可见结果、错误检查和必要截图。
- 发现的问题必须有复现路径、根因、修复或残留风险。
- 不把 G6/视频延期项当作 G0～G5 页面失败。
- Scrutiny Review 与 Runtime/User Review 均有结论。

## 退出标准

页面矩阵完成、问题处理完成、隔离进程清理、双 Review 和最终留痕完成后，任务才可关闭。

## 完成结论

- G0/G1 隔离环境门禁 34/34 通过。
- file Chromium 4/4、DB Chromium 9/9 通过。
- G4 候选决策与 G5 M4～M8 页面链路通过。
- 手工页面路径“新建项目 → 保存/完成剧本 → 生成/确认剧情结构 → 解锁分镜”通过。
- 素材包、G7 与轻量视频未进入本轮。
