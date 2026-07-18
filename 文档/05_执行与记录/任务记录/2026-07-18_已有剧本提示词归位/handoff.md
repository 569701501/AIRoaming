---
doc_id: AIR-TASK-IMPORT-PROMPT-004
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 本次实现与验证结果
---

# Handoff

## 已完成

- B2 原稿观察分析、B4 忠实章节整理、B4 忠实度验证和一次格式修复已归入 `script-import-normalize/references/`。
- 四个真实构造器直接读取 Skill；TypeScript 中重复的稳定角色、方法和禁止事项已移除。
- Skill 自述、发现元数据、OpenCodeAI 说明、ADR-0017 和来源卫生测试已同步。

## 保持不变

- B1 不可变原稿、B2 完整分析、B3 目录一次确认、B4 全章节入口和逐章后台处理、B5 逐章查看与确认。
- 长稿连续 block 分层分析、全部 block 唯一分配、目录范围与输出行引用。
- Shared 三份严格合同、一次修复、单章失败隔离、待确认只读与正式版本围栏。
- 页面字段、数据库 Schema、API、任务协议和付费调用规则。

## 验证

- Skill 校验：通过。
- 定向：Server 8 files / 60 tests；Shared 29 tests 通过。
- 全项目 typecheck、build：通过。
- Server 全量：124 files / 739 tests 通过。

## 后续范围

- 九个生产 Skill 的稳定 Prompt 已按 ADR-0017 归位；P6 离线 evaluator 和固定业务 Validator 继续按各自边界保留，不应伪装成公开 Skill。
- 本轮没有真实模型调用，不形成新的导入质量 A/B 结论。
