---
doc_id: AIR-D2-A4-LAYOUT-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: worker, reviewer, human
source: P6 代码与测试探索
---

# Findings

- G1 约束要求 LayoutRevision 先以 `bindingSetSealedAt=null` 创建，bindings 完整写入后才能 seal；`saveReason` 必须使用 `export_checkpoint`。
- Asset/ExportRevision 不能直接 INSERT ready；实现遵守 staged→ready 和 queued→ready 的受控状态迁移。
- WorkingCopy 的 createdAt/updatedAt 不能参与同锁集 replay digest；实现复用既有 document，避免重复创建 LayoutRevision。
- DB repository 目前将 layout local DTO 从 WorkingCopy 的 `legacyDocument` 读取，因此 export response 的历史确认时间不作为 DB current 的唯一事实；正式封存事实以 LayoutRevision/Chapter pointer 为准。
- package 物理源文件缺失时直接返回 `PACKAGE_*_MISSING`，不生成伪 ready Artifact。
