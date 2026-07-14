---
doc_id: AIR-G05-M6-SCRUTINY-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: reviewer, developer, qa, ai-agent
source: G5 契约、提交 429ec69、0014 migration 与 M6 自动化
---

# G5-M6 Scrutiny Review

## 结论

`passed`。提交 `429ec69` 关闭来源返修、不可变 LayoutRevision/SourceBinding、历史恢复和正式预检退出条件，可以连续进入 G5-M7。正式 renderer、publication task、PNG/PDF/slices 和 Artifact manifest 不属于 M6，未提前签收。

## 静态复核

| 关注点 | 结论 | 证据 |
| --- | --- | --- |
| 来源权威 | 通过 | 只查询目标 DB 的 Shot current CandidateLockRevision 与 ready Asset；无旧 `lockedCandidateId` 或 file fallback |
| preview/commit | 通过 | Shared 同一 builder 计算 from/to、逐图 cropMode、resultCrop、replacement/document digest；Server 写事务内重算 |
| 可撤销性 | 通过 | commit 只落 Working Copy；Web 将 before snapshot 与正式 `layout.replace_sources` forward command 记为一个 Undo batch，真实浏览器验证 stale↔current |
| Revision 原子性 | 通过 | unsealed Revision→bindings→seal→Chapter pointer→WC basedOn 同一业务事务；CAS/trigger 失败整体回滚 |
| replay | 通过 | source commit 与 Revision 仅在 expected+1、digest、previous/saveReason/basedOn 精确匹配时返回 replay |
| 历史恢复 | 通过 | 只覆盖 Working Copy document/source digest/basedOn 并递增 rowVersion，不移动 Chapter current、不改旧 Revision |
| preflight | 通过 | issue identity 不含本地化文案/时间；revision/export blockingScopes 分离；source/font/image/glyph fail-closed |
| warning 确认 | 通过 | requiresAcknowledgement 未确认阻止保存；重复 key 在 strict codec 拒绝，未知 key 在当前 report 事务内拒绝 |
| 0014 migration | 通过 | 只替换矛盾 insert trigger，不改表；复合 sourceDigest 不再错误比较 Asset.sha256，scope/ready/sha/unsealed/seal 门禁保留 |
| 阶段边界 | 通过 | 未创建 renderer、publication task、ExportArtifact、mobile/AI/legacy 新入口；旧正式产物未改写 |

## 复核中关闭的问题

- 首版正式 SourceBinding insert 被 G1 旧 trigger 拒绝，因为 LayoutDocument `sourceDigest` 是来源 ID 与 Asset sha 的复合摘要，不可能直接等于 `Asset.sha256`；0014 以 forward-only trigger replacement 修复，并用 migration shape/runtime tests 固定。
- 首版 warning acknowledgement 只检查“缺少确认”，任意未知 key 也会被接受；现要求所有 key 都属于本次 preflight report，防止确认漂移或客户端伪造。
- 首版来源 commit 后 Web 直接刷新 Working Copy，导致替换不能 Undo；现保存一个受限的 snapshot inverse 与 `layout.replace_sources` forward，真实页面已验证撤销后 stale、重做后 current。

## 后续不变量

- M7 renderer 只能读取 sealed immutable LayoutRevision 和同一 DB Asset/Font bytes，不得读取当前 Working Copy 或编辑器 DOM。
- M7 export preflight 必须使用 M6 的 issueKey/preflightDigest 与 warning acknowledgement 语义，不另建宽松门禁。
- 迟到任务、重试和 current publication 切换必须继续使用 G4/M6 source applicability 与 claim fencing。
