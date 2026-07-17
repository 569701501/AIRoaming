---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V24-SCRUTINY
status: passed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前差异、测试结果、A/B 指标和语义评测
---

# Scrutiny Review

## 结论

`passed_with_rejection`：实验过程、证据和回滚符合任务计划，V2.4 不应进入生产。

## 静态复核

- V2.4 只曾修改 Prompt 与契约测试，没有触及页面、Schema、DTO、数据库或媒体调用。
- 回滚后两个代码文件与当前 V2.3 `HEAD` 无差异；剩余改动只有实验、决策和完成记录。
- 独立 evaluator 未被生产服务导入，不改变待确认/确认状态机。
- Server 116 files / 702 tests、typecheck、build 和差异检查通过。

## 判定依据

- AI V2.4b 镜头数比 V2.3 增加 38.9%，总时长增加 32.9%。
- 导入 V2.4b 镜头数增加 9.1%，总时长增加 19.0%，语义仅回到 V2.3 首次评测水平。
- V2.4a 的语义收益真实存在，但同样未通过镜头/时长门槛。
- 因此采用 V2.4 会违反任务开始前冻结的回滚条件。

## 残留风险

- 两个固定项目不能代表所有题材，不能推断任何事实覆盖提示都无效；只能证明当前 7 步逐项映射写法不稳定。
- evaluator 是模型判断，存在边缘波动和一次格式失败；只能用于对照和人工复核，不可作为单次生产真值。
- OpenCode 文本进程在并发请求下出现退出；本轮改用串行规避，尚未修复并发稳定性。
