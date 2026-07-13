---
doc_id: AIR-G3-M5-RUNTIME-001
status: in_progress
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: acceptance_checklist.md
---

# M5 Runtime/User Review

## 当前状态

`not_run`。M5 尚未实现，本文件只固定未来运行路径；不能据此统计通过。

## A3 必须执行的临时路径

1. 创建全新临时 dataRoot、workspaceRoot、SQLite 和 fake secret store。
2. 准备 succeeded full-shadow DB、含 16 个有序 slice 的 full-import report、与 run 绑定的 decisions artifact、ready Asset 与 closed maintenance bundle。
3. 执行 `app:backup --kind coordinated`，确认 sealed bundle。
4. 对同一 bundle执行 `app:restore --mode verify-only`，确认目标根仍不存在。
5. 执行 `app:restore --mode materialize` 到两个不存在的新根。
6. 以恢复后的 DATABASE_URL/workspaceRoot、DB mode、maintenance closed 启动 Server。
7. 读取项目列表和 Workbench read-model，对比备份前规范化语义；确认旧 metadata 不存在仍可读。
8. 确认没有开放业务写、没有设置 firstBusinessWriteAt、没有 secret sentinel 泄漏。
9. 执行篡改、missing Asset、active writer、非空目标和 symlink 故障注入。

## 通过条件

只有 RST-04、BAK/RST 全部用例、server 全量测试和静态门禁通过后，才能把本文件更新为 `completed`。
