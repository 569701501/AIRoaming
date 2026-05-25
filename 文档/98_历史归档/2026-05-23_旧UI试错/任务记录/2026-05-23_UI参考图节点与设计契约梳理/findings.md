# 发现与决策

---
doc_id: AIR-TASK-20260523-UI-NODES-CONTRACT-FINDINGS
status: archived
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 发现

- 现有文档已经覆盖产品主链路、MVP、数据模型和模块依赖。
- 现有文档缺少“UI 参考图节点表”和“前端设计系统契约”。
- 2026-05-23 已经落地的 `App.vue` 包含多个 UI 壳节点，但文档尚未逐一标注状态和后续实现边界。

## 决策

| Decision | Rationale |
| --- | --- |
| 新增产品级 UI 节点文档 | 让人和 AI 知道参考图里每个区域是什么、是否属于 MVP |
| 新增前端 UI 状态与组件契约 | 防止 UI 占位被误认为真实功能 |
| 使用统一状态枚举 | 后续页面、按钮、面板都能标注能力成熟度 |
| 将设计 token 写入契约 | 后续样式调整有稳定依据 |

## 复核结论

| 检查项 | 结论 |
| --- | --- |
| 覆盖参考图首页 | 已覆盖：品牌侧栏、顶部栏、欢迎区、流程、最近项目、指标、右侧队列 |
| 覆盖漫画生成/页面编辑 | 已覆盖：生成设置、页面画布、候选条、属性面板、导出设置 |
| 覆盖剧本与分镜工作台 | 已覆盖：剧本结构、分镜卡片、AI 建议、节奏分析 |
| 明确 UI 壳边界 | 已通过 `UiFeatureStatus` 和“不能混淆的边界”说明 |
| 数据/协议影响 | 无代码和协议变更 |

## Scrutiny Review

| 检查项 | 结论 |
| --- | --- |
| 文档 frontmatter | 新增文档均包含 doc_id、status、created、updated、owner、audience、source |
| 状态枚举 | 产品文档与契约文档一致 |
| 事实源链接 | README、AI 上下文、核心用户流程、模块总览已同步 |
| 风险说明 | 已说明视觉占位不能当作真实能力 |

## Runtime/User Review

本次为文档梳理任务，无运行态 UI 改动。验证重点为路径和内容自检。
