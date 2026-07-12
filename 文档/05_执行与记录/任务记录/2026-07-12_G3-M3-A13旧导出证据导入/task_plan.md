---
doc_id: AIR-G3-M3-A13-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G5 layout_publication 契约与 G3-M 旧导出映射
---

# G3-M3-A13 旧导出证据导入计划

## 目标

把旧项目/章节 `exports/` 目录中的 manifest 与文件证据导入为可追溯的 `ExportRevision` 历史，不把旧证据伪装成 G5 已完成发布物。

## 边界

- 有 manifest 时保留 JSON 摘要和规范化 digest；无 manifest 时只保留可验证文件证据并标记 `legacy_unresolved`。
- 所有导入 revision 固定 `kind=layout_publication`、`status=failed`、`origin=legacy_import`、`completionApplicability=legacy_unresolved`。
- 不创建 `ExportArtifact`，不写 Chapter/Project 的 currentExportRevision 指针，不读取或写入旧 workspace。
- Dialogue/provider metadata、read-model/orchestration、M4 正式验收和 final/backup/activate 后续处理。

## 退出标准

- `--slice exports` 可执行，旧导出按 scope/目录稳定 sourceKey 与 target ID，重复运行不新增 revision。
- 集成测试覆盖 manifest、不可用 current、无 Artifact、replay 和目标章节 scope 校验。
- typecheck、定向测试、server 全量回归、G1 三项门禁和 diff check 通过；M4 仍保持 `in_progress`。
