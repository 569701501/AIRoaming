---
doc_id: AIR-TASK-20260710-AI-QUALITY-PROMPT-FINDINGS
status: proposed
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 发现与约束

## 已知事实

- 候选图前端 prompt 预览已由服务端权威 `CandidateGenerationSpec` 统一，旧报告中“前后端双拼接”已不再是首要问题。
- 当前真实图像失败包括场景参考图人物/文字污染，证明 prompt 文案不能替代输入素材资格和版本治理。
- OpenAI Image 官方说明仍存在精确文字、跨次一致性和布局控制限制。
- Runway Gen-4 Image 官方明确不支持 negative prompt，说明全局统一 negative prompt 不成立。
- Promptfoo 的可吸收方法是固定样例、矩阵评测、结构化评分和持续反馈；是否直接采用该工具待正式设计。

## 必须避免

- 把 agent system prompt、工作流技能、JSON schema 和图像 prompt 放进同一个模板类型。
- 只保存模板原文，不保存实际编译结果、模型版本和参考素材。
- 只做自动评分，不保留漫画视觉质量的人工复核。
- 在没有基线的情况下批量升级模型或 prompt。

## 重要来源

- https://developers.openai.com/api/docs/guides/image-generation
- https://help.runwayml.com/hc/en-us/articles/35694045317139-Gen-4-Image-Prompting-Guide
- https://www.promptfoo.dev/docs/intro/
- `文档/04_方案与决策/2026-07-09_提示词外部借鉴优先级.html`
- `文档/04_方案与决策/2026-07-09_项目提示词资产盘点.html`
- `apps/server/src/projects/candidate-generation-spec.ts`

## 待正式规划的问题

1. 首批评测聚焦文本链路还是候选图链路。
2. 视觉评分中人工、规则、OCR 和模型裁判各自的边界。
3. PromptVersion、EvalRun 与 GenerationTask 的数据库关系。
4. 生产模板发布是否需要审批，还是先由单一 owner 管理。
5. 评测运行的成本上限和供应商速率限制。
