---
doc_id: AIR-TASK-20260718-PROMPT-RESIDUE-REVIEW
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 后端 Prompt 残留静态复核
---

# Scrutiny Review

## 结论

**不通过，需要修复。**

三个 Skill 和 fail-closed 加载器已经真实接入，但“稳定提示词唯一事实源”尚未闭合。生产范围内仍有：

1. 持久 `shot_generate` 独立硬编码分镜 Prompt；
2. 图片 provider 硬编码参考图职责；
3. 后端构造分镜 JSON 示例语义；
4. Skill 外的画风/漫画格式 Prompt 词汇表。

另有非生产 P6 evaluator Prompt，以及本轮范围外的剧本/导入/剧情结构旧 Prompt。

## 风险判断

| 问题 | 级别 | 是否影响真实生产 Prompt |
| --- | --- | --- |
| `shot_generate` 旁路 | 高 | 是 |
| provider 参考图职责 | 高 | 是 |
| 分镜输出示例语义 | 中 | 是 |
| 画风/版式 Prompt 词汇 | 中 | 是 |
| P6 evaluator | 低 | 否，仅离线 QA |
| 剧本/结构旧 Prompt | 邻接范围 | 是，但不属于上一轮三个新 Skill 的窄范围 |

## 修复验收建议

- 生产源码只允许模板资产名、动态变量、Schema/错误文本和传输参数，不允许创作方法正文。
- `shot_generate` 必须复用同一 `storyboard-shot-generate` Skill 契约或正式退役，不能只把两句旁路 Prompt 搬成另一份模板。
- 参考图职责与 provider profile 一并由 `image-candidate-generate` Skill 编译。
- 分镜示例和图片 Prompt 词汇表移入对应 Skill references。
- 新增源码防回流测试；现有输出测试不足以证明唯一事实源。

## 后续状态

2026-07-18 已由 `文档/05_执行与记录/任务记录/2026-07-18_Prompt残留修复/` 完成本报告列出的 4 类生产残留修复。本页保留“不通过”作为修复前审计证据；修复后的正式结论见新任务的 `scrutiny_review.md`。
