---
doc_id: AIR-D2-A5-RUNTIME-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, qa, human
source: fresh SQLite + fake provider runtime review
---

# Runtime Review

## 场景

使用 fresh SQLite、临时 data root 和 fake OpenCode runtime：

1. 创建项目并发送普通 Dialogue；验证 user/assistant、tool result、active session。
2. 生成三条 fake inspiration seeds；验证 pending artifact 写入。
3. 关闭 Nest context 后重启；验证 running message failed、session closed、pending restore。
4. 发送取消指令；验证 pending artifact 变 discarded，无明文副本。
5. 发送普通消息；验证新 session 创建且旧 session 不复活。
6. maintenance close 时发送被 `MAINTENANCE_MODE` 拒绝；project `deleting` 时发送被 `PROJECT_NOT_FOUND` 拒绝且 message count 不变。

## 结果

`P7-DIALOGUE-DB-01` 通过；未触碰真实系统服务、真实 provider、真实凭据或真实 workspace。
