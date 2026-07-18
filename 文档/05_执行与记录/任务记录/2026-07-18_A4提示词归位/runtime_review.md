---
doc_id: AIR-TASK-A4-PROMPT-006
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 离线运行复核
---

# Runtime / User Review

## 结论

`PASS_OFFLINE`

## 运行证据

- 真实 Prompt builder 能从 Skill 读取主模板，并完整注入精确章标题、目标/相邻章节卡、前章正式全文、确认大纲和用户有效补充。
- 格式失败和 P3/P5 质量失败分别编译不同修复合同，第二次仍失败时沿用既有停止逻辑。
- A4 service 回归覆盖：明确生成、禁止自动生成、错误章节、待确认大纲、格式修复一次、P3/P5 重写一次、二次失败不创建 pending。
- 定向回归 58/58；Server 全量 737/737；类型检查和构建通过。

## 不适用与未执行

- 本轮没有 UI、字段或用户操作变化，因此不重复浏览器页面测试。
- 按预算与任务约束不调用真实文本模型或图片服务；付费调用为 0。实际生成文案质量沿用既有 A4 验收结论，本轮只确认 Prompt 来源迁移没有破坏固定合同。
