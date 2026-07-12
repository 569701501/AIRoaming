---
doc_id: AIR-G3-M3-A12-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 LayoutWorkingCopy 契约与 G3-M 旧数据映射
---

# G3-M3-A12 布局工作副本导入计划

## 目标

将旧 `chapters/{slug}/layout/layout.json` 导入 `LayoutWorkingCopy`，统一包成 `legacy_chapter_layout_v1` envelope，并保留来源绑定证据。

## 边界

- 只写 Working Copy，不创建 LayoutRevision、ExportRevision 或 currentLayout 指针。
- Candidate、Shot、CandidateLockRevision、Asset 和物理 hash 全部可证明时标记 `sourceResolution=complete`；否则保留脱敏旧文档并标记 `unresolved`，仅 warning，不猜测来源。
- 目标项目/章节缺失、JSON 损坏或 scope 冲突记录 blocker；不触碰旧 workspace。
- 导出目录/manifest、Dialogue/provider metadata 和 full importer orchestration 后续切片处理。

## 退出标准

- `--slice layout` 可执行，稳定 sourceKey/target ID，事务写入 Working Copy 与 ImportedEntitySource。
- 集成测试覆盖 complete envelope、unresolved 不推进 current、replay 无重复。
- typecheck、定向测试和全量回归通过；M4 仍保持 `in_progress`。
