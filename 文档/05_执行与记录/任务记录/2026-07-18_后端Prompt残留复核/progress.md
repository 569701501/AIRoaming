---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-PROGRESS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 后端 Prompt 残留复核执行记录
---

# 后端 Prompt 残留复核进度

## 2026-07-18

- Orchestrator：已读取项目规则、ADR-0017、模块边界、长期记忆和 `$deep-think`。
- 当前阶段：建立判定标准并开始只读扫描。

### Scrutiny Review

- 扫描范围：`apps/server/src`、`packages/shared`、三个生产 Skill、相关测试与公开任务入口。
- 方法：长字符串/指令关键词扫描、Skill reference 精确行反查、`sendMessage` 调用枚举、三条生产调用链逐段阅读、公开 `/tasks` 可达性检查。
- 离线测试：Skill 加载、分镜 Prompt、参考图 Prompt、候选图 Prompt、图片 provider 共 5 个测试文件、34/34 通过。
- 结论：`not_passed`。测试证明当前行为稳定，但其中 `image-provider.service.spec.ts` 正在锁定后端硬编码的参考图职责文本，不能作为“无残留”证据。
- 详细问题见 `findings.md` 和 `scrutiny_review.md`。

### Runtime/User Review

- 不适用。本轮没有修改生产代码、页面或协议，不调用真实模型或图片 provider。
- 公开 `/tasks` → `shot_generate` 的静态可达性已通过 Controller、create guard 和 worker handler 三段代码确认；无需付费调用才能判定旁路存在。

## Handoff

- 状态：复核完成，等待进入修复阶段。
- 建议修复顺序：先统一 `shot_generate` 生产入口，再迁移 provider 参考图职责，随后迁移分镜示例与图片提示词词汇表，最后单独处理 P6 evaluator 和剧本/结构 Prompt。
- 禁止：在修复时只复制文本到 Skill 而保留原硬编码；必须补“生产源码不得出现稳定提示词特征”的防回流测试。
