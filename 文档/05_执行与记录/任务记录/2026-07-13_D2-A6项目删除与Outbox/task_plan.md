---
doc_id: AIR-D2-A6-PLAN-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: worker, reviewer, human
source: D2 至 M6 连续交付总 Handoff
---

# D2-A6 项目删除与 Outbox

## 目标

在 DB 模式闭合 `asset.promote`、`asset.delete`、`project.delete_files`、`secret.delete_old_ref`、`legacy_metadata.archive` 五类事件；项目删除先写 deleting intent，再由受租约保护的 worker 清理受控文件，最后才允许 DB purge。

## 非目标

不触碰真实 workspace、真实 Keychain、真实 provider/凭据、D2-A7/A8、final importer、M6 或真实切换。

## 退出标准

- [x] payload exact-key、digest、scope、storage-key 和 SEC-10 sentinel 门禁。
- [x] claim/heartbeat/过期恢复、5s/30s retry 与 terminal 不重开语义。
- [x] 项目删除 API 幂等，deleting fence 生效，重启后可继续处理。
- [x] processed file event 后才可 purge，保留 Outbox 审计行。
- [x] capability registry 8/36，`blockedIds=[]`，独立测试与复核记录完成。
