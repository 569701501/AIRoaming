---
doc_id: AIR-RCUT-R0B-SCRUTINY-001
status: passed_release_shadow_waiting_human_SH10
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, migration-reviewer, ai-agent
source: R0-B remediation commits 74a6d71/29f40bb、real-source shadow 与 SH-01～SH-09 证据
---

# R0-B remediation Scrutiny Review

## 结论

代码与 release-specific 证据复核通过。SH-01～SH-09 已满足本施工包要求；本记录不替代人工 SH-10，也不授予 AUTH 或 C0～C7 权限。

## 代码检查

- resolver 仅允许 sourceId/targetId 精确命中或唯一 exactName；未知、重复候选、空 token 均 fail-closed。
- Story 输出引用 StoryDocumentV2 character card id；projectCharacterId 仍按稳定 DB Character id 绑定。
- Storyboard 读取同一 sealed snapshot 的 shared characters；非空 token 不会被清空；目标 Character 必须存在且属于当前 project。
- `StoryboardShotCharacter` 按 document 顺序创建，relation id、order、sourceToken、characterId replay 冲突均 fail-closed；relation 在 StoryboardVersion confirmation 前完成。
- full shadow 顺序为 `story -> characters -> storyboard`；`StoryboardShotCharacter` 只作为 g3-m3-a6 contextual count，不加入 source-evidence binding。
- Story milestone 只单调推进；preview_front 不写 confirmedAt，避免触发 G1 check。
- 未修改 Prisma schema、migration tree、trigger、SecretStore、C0～C7 或真实写入口。

## 证据

- remediation commits：`74a6d71`、`29f40bb`。
- 定向/全量：integration 74 tests；服务端全量 71 spec/483 tests；typecheck、server/web build、Prisma、G1、capability、diff check 均通过。
- legacy preflight v1→V2 adapter 只使用已导入目标 DB 证据重建 sourceSnapshot，异常仍 fail-closed；未修改 schema/migration/trigger。
- real-source A/B：16/16 succeeded，aggregate reportDigest=`sha256:daca7e92...663e781`，table-count digest=`sha256:25f14b5a...117fc0a`，open blocker=0。
- source pre/post 对照仅新增授权 `structure.json`；shadow 生成的 67 个隔离 asset 文件已清理，最终 source digest=`sha256:c16ff088...4beebb`。

## 未通过/未执行

- SH-01～SH-09：`passed_release_shadow`。
- SH-10：`awaiting_human_migration_reviewer`，未由 Codex/Luna 自签。
- coordinated backup/verify-only/materialize restore：通过，67 assets，integrity/FK 全绿。
- 默认 Keychain、真实凭据、停写、AUTH、C0～C7：操作次数均为 0。

## 建议

下一步只交人工 Migration reviewer 审阅 SH-10；在人工签署和另行授权前，不得生成 AUTH、停写或进入 C0～C7。
