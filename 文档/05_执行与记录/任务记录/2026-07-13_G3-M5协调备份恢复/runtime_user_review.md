---
doc_id: AIR-G3-M5-RUNTIME-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: acceptance_checklist.md
---

# M5 Runtime/User Review

## 当前状态

`completed`。M5-A3 已在全新临时 data/workspace/SQLite 根完成 backup → restore → restart/API 演练；未触碰真实根、SecretStore、final import 或 activate。

## A3 必须执行的临时路径

1. 创建全新临时 dataRoot、workspaceRoot、SQLite 和 fake secret store。
2. 准备 succeeded full-shadow DB、含 16 个有序 slice 的 full-import report、与 run 绑定的 decisions artifact、ready Asset 与 closed maintenance bundle。
3. 执行 `app:backup --kind coordinated`，确认 sealed bundle。
4. 对同一 bundle执行 `app:restore --mode verify-only`，确认目标根仍不存在。
5. 执行 `app:restore --mode materialize` 到两个不存在的新根。
6. 以恢复后的 DATABASE_URL/workspaceRoot、DB mode、maintenance closed 启动 Server。
7. 读取项目列表和 Workbench read-model，对比备份前规范化语义；确认旧 metadata 不存在仍可读。
8. 确认没有开放业务写、没有设置 firstBusinessWriteAt、没有 secret sentinel 泄漏。
9. 已执行 manifest 篡改、missing Asset、非空目标和 `pre-cutover` fail-closed；active writer/WAL 和 symlink 逻辑由 A1/A2 服务门禁覆盖，未对真实根做注入。

## 通过条件

通过证据：A1 3/3、A2/A3 4/4、server 49 files/314 tests、workspace typecheck、G1 三项检查、Prisma validate 和 diff check 全部通过。M6 仍需另行复核 capability、SecretStore、final importer 和 activate。
