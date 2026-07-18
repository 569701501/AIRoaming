---
doc_id: AIR-TASK-IMPORT-PROMPT-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: ADR-0017 与已有剧本 B1～B5 真实生产链
---

# 已有剧本提示词归位任务计划

## 目标

将 `script-import-normalize` 的 B2 原稿观察分析、B4 忠实章节整理、B4 忠实度验证和一次格式修复 Prompt 归入 Skill references，并让真实生产路径读取。

## 非目标

- 不改 B1～B5 用户流程、目录一次确认、全部章节入口创建或逐章确认方式。
- 不提供手动整理、AI 重新整理、采用、丢弃或批量确认。
- 不改页面字段、章节 Markdown、数据库 Schema、API、任务协议或状态枚举。
- 不把分析、整理和验证合并成一个 Prompt，也不新增公开 Skill。
- 不改变长稿分层分析、来源范围算法、strict parser、硬问题判定、一次重试或失败隔离。
- 不调用真实文本模型或付费媒体服务。

## 阶段

| 阶段 | 工作 | 退出标准 |
| --- | --- | --- |
| 1. 事实盘点 | 对齐 B2/B4 真实入口、来源装配、解析与批处理围栏 | 已完成 |
| 2. Skill 资产 | 新增三份生产模板、一次格式修复模板和 `agents/openai.yaml` | 已完成，Skill 校验通过 |
| 3. 真实接线 | 四个构造器读取 Skill，移除 TypeScript 重复稳定正文 | 已完成，动态装配和业务围栏不变 |
| 4. 验证 | 来源卫生、Prompt 合同、服务回归、类型、构建、全量测试 | 已完成，最终全绿 |
| 5. 留痕 | 更新 ADR、完成记录、Handoff、双复核和长期记忆 | 已完成 |

## 强制验收标准

1. B2/B4 三份主 Prompt 和格式修复正文均来自 `script-import-normalize/references/`。
2. B2 仍只输出 observed 分析；所有原稿 block 必须完整、唯一、顺序一致地分配或明确排除。
3. B4 整理仍只做忠实格式转换；验证仍只审计，不继续改写。
4. Shared strict parser、来源范围校验、行引用和一次重试上限保留最终放行权。
5. 一章失败不阻断其他章节；只有无硬问题的待确认稿可由用户逐章确认成正式版本。
6. 页面、字段、Schema、API、任务协议和付费调用规则不变。

## 风险与回滚

- 风险：模板占位符遗漏动态来源、分析示例引用失真、修复模板借机改剧情。
- 控制：保留代码生成的动态 Schema 示例、strict parser、现有服务回归和来源卫生测试。
- 回滚：本轮无数据或协议迁移，恢复四个 builder 与对应 Skill 资产即可。
