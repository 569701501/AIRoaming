---
doc_id: AIR-TASK-20260712-G3M-DOC-FINDINGS
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前仓库与 G1/G3 文档探索
---

# findings

## 已有基础

- G3-core 已完成 canonical 两值、0010、API/PATCH 保护、file alias 只读兼容、Candidate/Prompt V2 与 Web 状态。
- Prisma 已有 PersistenceState、MigrationRun、ImportedEntitySource、MigrationIssue 及完整约束。
- G3 主字典已定义版式 mapper、issueKey、detailJson、resolutionJson 和报告字段。

## 文档缺口

- 没有 G3-M 的单独入口、切片顺序、精确文件地图或可复制任务书。
- G1 长文描述了全量迁移，但没有把当前代码缺口转成 implementation gate。
- 备份集合、恢复目标、原子发布点、CLI 输入输出和失败码没有冻结到可编码级。
- 旧验收清单仍把多项 G3-core 状态写成 not_run，容易误导接手者。

## 关键裁决

- G3-M 不是独立 mapper；它是 G1 M2～M4 迁移运行时 + G3 comic-format decision plugin。
- Luna 可以先实现 maintenance/snapshot/decision/import foundation，但在 DB capability inventory 非零、SecretStore/全量 importer/协调备份未完成时必须停在 shadow/final-ready 之前，不得 activate。

## 最终结论

- 原文档不足以安全一次性交给 Luna 完成全部 G3-M；补齐后可以从 G3-M0 开始。
- 交接前仍需把 G3-core 与文档提交为明确 commit，并更新 handoff SHA。
