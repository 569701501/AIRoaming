---
doc_id: AIR-D2-A4-LAYOUT-PLAN-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: worker, reviewer, human
source: D2-M6 连续执行总 Handoff
---

# D2-A4 Layout/Export DB 闭环

## 目标

关闭 `build_layout`、`export_layout`、`export_asset_package` 的 DB-only unsupported 分支，并让 LayoutWorkingCopy、LayoutRevision、ExportRevision、ExportArtifact 成为可重放的事实链。

## 实施边界

- 只读取 current Preflight、active Shot、current CandidateLock、ready Asset；不扫描旧 layout/storyboard JSON。
- Layout seal 必须建立完整 Shot→Candidate→LockRevision→Asset binding，并绑定 source digest。
- 物理文件只写 WorkspacePathService 受控根；使用 temp→fsync→rename，测试只用临时根。
- ready ExportRevision 只能通过 ready Asset Artifact，失败或缺文件 fail-closed。
- 不实现 Dialogue、Outbox consumer、Project delete、final importer、M6 activate，也不使用真实 provider/凭据。

## 退出标准

- `P6-LAYOUT-EXPORT-01` 通过：build/replay、seal/binding、export ready、package ready、restart/DB read consistency。
- server DB integration、typecheck、file-mode characterization、G1/Prisma 门禁通过。
- Scrutiny/Runtime review 写明通过与残留风险；capability 仅把三个 P6 operation 改为 implemented。
