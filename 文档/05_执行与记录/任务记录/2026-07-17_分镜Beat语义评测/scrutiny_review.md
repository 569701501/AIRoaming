---
doc_id: AIR-TASK-20260717-STORYBOARD-BEAT-SEMANTIC-EVAL-SCRUTINY
status: passed_with_observation
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 实现差异、契约测试和四份真实报告
---

# Scrutiny Review

## 结论

`passed_with_observation`

实现满足 QA-only 范围，没有侵入生产分镜或数据协议。模型边缘判断存在波动，已通过产品边界限制而非伪装成确定性硬门。

## 静态复核

| 项目 | 结论 |
| --- | --- |
| 输入收敛 | 只携带 Beat 事实与实际可观察镜头字段，不携带 `promptDraft`、构图设计或项目背景 |
| 输出契约 | 根和 Beat 对象均拒绝额外字段；必须恰好按结构顺序覆盖全部 Beat |
| 证据归属 | 镜头序号只能来自当前 Beat，重复和非法序号均拒绝 |
| 状态语义 | partial/missing 必须说明缺失事实；contradicted 必须说明矛盾；总状态本地计算 |
| 运行安全 | CLI 复用现有 deny-all OpenCode 运行时，不复制模型网关或业务工具权限 |
| 持久化 | 只原子写用户指定报告；没有 repository、数据库、页面或 Storyboard 写入依赖 |
| 回滚 | 删除 3 个代码文件、package script 和任务文档即可，无迁移或历史数据处理 |

## 验证

- 定向测试：9/9。
- 服务端全量：116 个测试文件、702 个用例。
- Typecheck、build、`git diff --check`：通过。
- 四次真实报告：严格契约全部通过。

## 非阻断观察

- `partial` 的边缘判断会随模型运行波动，导入样本第二次多出两个 Beat。
- 报告是语义诊断，不是事实裁决；后续 A/B 应重复运行并保留人工复核。
- 当前 Prompt 输入长度在真实 AI 样本约 1.55 万字符；按需 QA 可接受，但不应无条件附加到每次用户生成。
