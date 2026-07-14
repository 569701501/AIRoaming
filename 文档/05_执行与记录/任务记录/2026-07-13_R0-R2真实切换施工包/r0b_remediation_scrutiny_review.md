---
doc_id: AIR-RCUT-R0B-SCRUTINY-001
status: blocked_preflight_source
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, migration-reviewer, ai-agent
source: R0-B remediation commit 74a6d71 与 clean overlay 证据
---

# R0-B remediation Scrutiny Review

## 结论

代码复核通过；release-specific overlay 复核在既有 preflight source blocker 处停止。不得把本记录解释为 SH-01～SH-09 通过，也不得进入真实源恢复。

## 代码检查

- resolver 仅允许 sourceId/targetId 精确命中或唯一 exactName；未知、重复候选、空 token 均 fail-closed。
- Story 输出引用 StoryDocumentV2 character card id；projectCharacterId 仍按稳定 DB Character id 绑定。
- Storyboard 读取同一 sealed snapshot 的 shared characters；非空 token 不会被清空；目标 Character 必须存在且属于当前 project。
- `StoryboardShotCharacter` 按 document 顺序创建，relation id、order、sourceToken、characterId replay 冲突均 fail-closed；relation 在 StoryboardVersion confirmation 前完成。
- full shadow 顺序为 `story -> characters -> storyboard`；`StoryboardShotCharacter` 只作为 g3-m3-a6 contextual count，不加入 source-evidence binding。
- Story milestone 只单调推进；preview_front 不写 confirmedAt，避免触发 G1 check。
- 未修改 Prisma schema、migration tree、trigger、SecretStore、C0～C7 或真实写入口。

## 证据

- remediation commit：`74a6d71`。
- 定向 78 tests、服务端全量 71 spec/482 tests、typecheck、server/web build、Prisma、G1、capability、diff check 均通过。
- clean overlay A/B 在前 8 slice 完全一致；Storyboard counts=`1/15/15/65`，AssetVisuals=`67/24/9`。
- preflight 两边同报 `PREFLIGHT_SOURCE_UNRESOLVED`，原因是 legacy `preflight.json` 缺少 `sourceSnapshot`。该文件不属于 R0-B 允许改动范围。

## 未通过/未执行

- SH-03 blocker=0：未通过。
- SH-04～SH-10：未运行/未就绪。
- 真实 source 单文件原子恢复：未运行。
- 默认 Keychain、真实凭据、停写、AUTH、C0～C7：操作次数均为 0。

## 建议

另建独立 preflight source remediation 任务，先明确如何取得合法 sourceSnapshot；在该任务完成并重新通过 clean overlay full shadow 前，不得恢复真实 `structure.json`。
