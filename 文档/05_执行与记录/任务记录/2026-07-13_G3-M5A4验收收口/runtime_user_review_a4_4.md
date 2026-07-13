---
doc_id: AIR-G3-M5-A4-4-RUNTIME-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-4 临时 fixture 运行复核
---

# M5-A4-4 Runtime/User Review

## 结论

`passed_for_m5_backend_fixture`。

M5 backup/restore 是后端临时根流程，没有真实 UI 点击路径；本轮使用临时 release、bundle、SQLite、data/workspace 根完成 rehearsal。

## 运行证据

- materialize 后恢复 DB 与 Asset 文件内容可读，DB/workspace sentinel=0。
- 设置恢复 DB 启动 Nest 后，maintenance coordinator 为 `closed`。
- `GET /api/projects` 返回恢复项目 `p1`，只读路径可用。
- `PersistenceState` 保持 `activationState=shadow`、`cutoverRunId=null`、`firstBusinessWriteAt=null`。
- 全部 A4 故障注入与回归通过；失败路径无不安全残留根。

所有数据均位于临时根；未访问真实 workspace、真实 DB、系统 SecretStore 或执行 activate。
