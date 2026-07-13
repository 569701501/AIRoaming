---
doc_id: AIR-G3-M5-A4-3-RUNTIME-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A4-3 临时 fixture 运行复核
---

# M5-A4-3 Runtime/User Review

## 结论

`passed_for_a4_3_backend_fixture`。

本切片是纯后端 backup/restore 故障矩阵，不需要真实 UI；所有运行均使用临时 SQLite、临时 bundle、临时 release fixture、临时 data/workspace 根。

## 运行证据

- full-shadow 缺 slice/重复 slice：均返回 `BACKUP_RUN_INVALID`，无 SEALED。
- DB/Asset sentinel：均返回 `BACKUP_SECRET_DETECTED`，无 SEALED。
- symlink、祖先/后代重叠、non-sealed、storageKey 越界：均在目标写入前失败。
- 第二根 rename 失败：未外部修改时第一根被安全清理；外部增加文件时第一根保留并返回 `RESTORE_COMPENSATION_UNSAFE`。
- backup/restore 集成 spec：32/32 通过。

禁止范围均满足：未访问真实 workspace、真实 DB 或系统 SecretStore；A4-4、D2、M6 未执行。
