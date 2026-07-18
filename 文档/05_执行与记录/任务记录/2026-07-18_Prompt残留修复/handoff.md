---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-FIX-HANDOFF
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: Prompt 残留修复交接
---

# Handoff

## 已完成

- 关闭 4 类生产 Prompt 残留。
- 保持页面字段、确认点、数据库 Schema、任务协议和付费触发规则不变。
- 增加 Skill 校验、行为回归和源码防回流检查。

## 验证

- 三个 Skill：`quick_validate.py` 全部通过。
- 定向测试：42 项通过。
- Server 全套离线测试：通过。
- 全项目 typecheck/build：通过。
- `git diff --check`：通过。
- 真实付费图片请求：0。

## 后续可选项

1. 把 P6 evaluator Prompt 独立迁为 QA Skill。
2. 按优先级迁移剧本、导入、剧情结构和旧 `story_parse` Prompt。
3. 每迁移一类都复用本次防回流模式，不做一次性全项目大改。
