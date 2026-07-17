---
doc_id: AIR-TASK-20260717-STORYBOARD-SEMANTIC-CORPUS-RUNTIME
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: dry-run、全集两轮与动作样例定向重试
---

# Runtime / User Review

## 结论

`passed_qa_only`

## 真实路径

1. 使用仓库固定 corpus 运行 `--dry-run`，确认 5 个样例 Prompt 均可生成且不启动模型。
2. 使用 `self/gpt-5.5`、`--repeat 2` 串行执行全集 10 次。
3. 检查每项严格解析、人工预期比较、重复稳定汇总和失败留痕。
4. 使用 `--fixture action-chase-reversal --repeat 2` 定向重试首次契约失败样例。
5. 检查输出文件、进程退出和业务范围隔离。

## 用户可见影响

无页面或业务用户路径变化。本能力是开发/QA 命令，不新增按钮、字段、状态、确认点或自动操作，因此浏览器复核不适用。

## 运行结果

- 全集已有 9 个有效结果：人工预期一致 98.1%，重复稳定 95.8%。
- 动作样例补充两次有效结果：一致和稳定均 100%。
- 唯一稳定性观察点是抽象关系状态，不是声音、屏幕身份、对白选择或动作结果。
- 所有运行结束后 corpus CLI、OpenCode 4396 和 Vitest 相关进程均退出。
- 主应用、业务数据库和项目数据没有被 corpus CLI 修改。
- 媒体服务调用为 0。

## 用户判断边界

本工具可以告诉评测人员“哪些结构事实可能被分镜弱化”，不能替用户判断节奏、审美和是否接受创作偏差。任何 `partial` 或 `contradicted` 都应结合重复结果和人工阅读处理。
