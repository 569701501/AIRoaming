---
doc_id: AIR-D2-A3-1-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, ai-agent, qa
source: A3-1 handoff and G2 versioning contract
---

# 实施契约

## DB 模式边界

- 旧 Story/Storyboard/Preflight 写方法必须在任何 `ProjectStore` 读写前返回 HTTP 409 `LEGACY_WRITE_ROUTE_DISABLED`。
- details 必须包含 operation、reason、replacement；replacement 指向现有 G2 API。
- file mode 不改变原有文件编排。

## 唯一替代入口

- Story：`/story-structure/working-copy` create/update/discard/confirm，确认时提交 observed pending/current/rowVersion/source digest。
- Storyboard：`/storyboard/working-copy` create/update/discard/confirm；镜头增删走 pending shot CAS。
- Preflight：`GET /image-preflight/preview` 后提交 observed storyboard id/digest 与 chapter rowVersion 到 confirm；ready 由服务端重算。
- 角色解析：本阶段旧入口退役，使用 Preflight preview 的 unresolved evidence，角色/视觉正式写入属于后续 Character/Asset 阶段。

## capability

操作级 `retired` 必须有 reason、replacement、稳定拒绝测试和 modern replacement 成功证据；aggregate 只有在全部 operation closed 且 restart/freshness 证据存在时才改为 implemented。
