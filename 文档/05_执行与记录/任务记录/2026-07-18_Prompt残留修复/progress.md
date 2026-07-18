---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-FIX-PROGRESS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: Prompt 残留修复执行过程
---

# 进度

- 2026-07-18：读取 ADR-0017、残留复核证据、三个 Skill 及相关运行时和测试代码。
- 2026-07-18：冻结本次范围为 4 类生产残留和防回流测试；P6 evaluator 与旧剧本类 Prompt 留待后续。
- 2026-07-18：`storyboard-shot-generate` 新增 generate/revise JSON 示例和 pending 草稿区 reference；代码只填动态引用。
- 2026-07-18：持久 `shot_generate` 改为读取结构绑定的正式剧本，复用完整分镜 Skill、对白候选、输出契约、固定质量门、引用映射和一次修复；正式 Shot ID 由后端分配。
- 2026-07-18：三家 provider 参考图职责迁入 `image-candidate-generate/references/provider-profiles.json`。
- 2026-07-18：参考图画风与漫画格式词汇迁入 `image-reference-generate/references/reference-defaults.json`；Shared 漫画格式目录不再保存 Prompt 专用字段。
- 2026-07-18：新增源码防回流检查和持久分镜任务行为测试。
- 2026-07-18：三个 Skill 校验通过；定向 42 项测试、服务器全套测试、全项目类型检查和构建通过；真实图片调用为 0。
