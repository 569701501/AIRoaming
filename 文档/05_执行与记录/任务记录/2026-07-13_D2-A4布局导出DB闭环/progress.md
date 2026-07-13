---
doc_id: AIR-D2-A4-LAYOUT-PROGRESS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: worker, reviewer, human
source: P6 实施记录
---

# 进度

1. `LayoutExportService` 增加 DB 分支：current preflight/locks/assets 校验、LayoutWorkingCopy digest 与 rowVersion 更新。
2. export 事务创建 append-only LayoutRevision，写入 LayoutSourceBinding，seal binding set，更新 Chapter current layout pointer。
3. 受控 workspace 的 layout JSON 使用临时文件、fsync、rename；ExportRevision/Artifact 以 staged→ready Asset 完成。
4. `AssetPackageService` 增加 DB 分支：从 DB bindings 和 ready Asset 生成 package manifest/文件，登记 asset_package ExportRevision/Artifact。
5. 项目 DB 集成测试扩展为 P6-LAYOUT-EXPORT-01；定向与 28/28 DB 全量通过。
6. capability registry 的三个 operation 改为 implemented；Character delete 仍由 P8 Outbox 负责，未误改 aggregate blocker。
