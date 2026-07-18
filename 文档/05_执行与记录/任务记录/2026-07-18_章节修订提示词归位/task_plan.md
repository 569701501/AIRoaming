---
doc_id: AIR-TASK-CHAPTER-EDIT-PROMPT-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: ADR-0017 与章节修订真实生产链
---

# 章节修订提示词归位任务计划

## 目标

将 `script-chapter-editing` 的主修订 Prompt、四层 P4 合同、P4/P5 质量重写和 strict format 修复归入 Skill references，并让真实生产路径读取。

## 非目标

- 不改页面字段、章节 Markdown、数据库 Schema、API 或任务协议。
- 不改章节修订的显式触发、最高层分类和用户操作方式。
- 不改前章正式版本门禁、来源围栏、AI pending 或 A5 采用/丢弃/完成流程。
- 不扩张 P4/P5 Validator，不调用真实文本模型或付费媒体服务。

## 阶段

| 阶段 | 工作 | 退出标准 |
| --- | --- | --- |
| 1. 事实盘点 | 对齐真实入口、层级分类、strict parser、P4/P5、修复和写入围栏 | 已完成 |
| 2. Skill 资产 | 新增主模板、四层合同、连续性规则、三类修复与 `agents/openai.yaml` | 已完成，Skill 校验通过 |
| 3. 真实接线 | 主生成与一次修复读取 Skill，移除 TypeScript 重复正文 | 已完成，行为和数据流不变 |
| 4. 验证 | 来源卫生、定向回归、类型、构建、全量测试 | 已完成，无新失败 |
| 5. 留痕 | 更新 ADR、完成记录、Handoff、双复核和长期记忆 | 已完成 |

## 强制验收标准

1. 主修订 Prompt 和 P4/P5/格式修复均来自 `script-chapter-editing/references/`。
2. 四种修订层级仍由 Server 确定，Prompt 只读取确定结果，不自行重分类。
3. 当前草稿、用户要求、精确章序和必要的前章正式全文完整注入。
4. Shared strict parser、`assertP4LayeredRevision`、`assertP5RevisionContinuity` 和一次总修复上限保持最终放行权。
5. 第二次失败不创建 AI pending；版本/待确认状态变化仍拒绝写入。
6. 页面、字段、确认门和付费调用规则不变。

## 风险与回滚

- 风险：层级模板遗漏保护项、P5 修复覆盖用户有效修改、格式修复借机改剧情。
- 控制：固定 Validator、三类分离修复模板、一次上限、现有 Service 回归和来源卫生测试。
- 回滚：本轮无数据/协议迁移，恢复 builder 与对应 Skill 资产即可。
