---
doc_id: AIR-D2-M6-MASTER-PROGRESS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: orchestrator, worker, reviewer, human
source: 本总目标编制过程
---

# 进度

## P0 基线核对（历史记录；最新接管状态见 `luna_execute_all_remaining.md`）

- 当时的阶段基线为 8 个聚合 capability、36 个 operation、2 个 blocker；该值已在 D2-A6 收口后降为 `blockedIds=[]`。
- `db-import --kind final --format json`：保持 `MIGRATION_FINAL_IMPORT_NOT_READY` fail-closed。
- 当前已提交事实基线为 `075986f feat(d2): close project delete outbox`；D2-A2-1～D2-A6 均已有代码、阶段证据和独立提交。
- 结论：总 Handoff 已完成 D2-A7、D2-A8 与 M6 tooling/临时演练；真实 `db:activate` 仍需授权。

## 2026-07-13

- 核实 M5-A0～A4 已完成，M5 状态为 `completed`。
- 核实 D2-A0、D2-A1-2、D2-A2-1、D2-A2-2、D2-A3-1 已完成；D2-A3-2A/B 仍有 Character delete 收口缺口。
- 从 capability registry 与真实 CLI report 核实 8 个聚合项、36 个 operation、3 个 `blockedIds`。
- 核实 `db:import --kind final` 仍 fail-closed，`db:activate` package script/实现尚不存在。
- 读取 G1 Repository、Layout/Export、Outbox/Delete、Secret、ACT/RB 与 C0～C7 验收口径。
- 已编写总 Handoff、总目标、全量剩余工作、实施契约、测试矩阵、文件地图和自动续跑协议。
- 已同步现行路线、G3-M 依赖/验收、备份激活文档、A2-1 Handoff、AI 上下文入口和 README。
- capability 真实 CLI 复核为 8/36/3；36 operation、8 capability、P0～P12、frontmatter/doc_id 与 stale 状态扫描通过。
- `git diff --check` 通过；静态结论为 `passed_for_luna_continuous_execution`。
- 已更新会话记忆与长期记忆；待创建本总资料独立 commit。

## P1 D2-A2-1（已完成）

- 已实现 DB/file 双模式的非破坏性公开写闭环，独立提交 `1f22861`。
- 定向 27 项、server 全量 54 文件/360 测试、Scrutiny、Runtime 均通过。

## P2 D2-A2-2（已完成）

- 7 个 legacy clear/import/reset/pending 写入口已正式 `retired`，每项具备 reason、replacement 与 fresh SQLite 证据。
- 新增只读 `GET /api/projects/:projectId/script/impact-preview`；DB 模式旧入口稳定返回 409，零 workspace 副作用。
- 定向 20 项、server 全量 54 文件/361 测试、typecheck/web build/Prisma/G1/diff check 全部通过；Scrutiny、Runtime 均通过。
- capability 由 8/36/6 变为 8/36/5；下一阶段进入 P3 D2-A3-1，仍不触碰真实数据、Outbox consumer、final importer 或 M6。

## P3 D2-A3-1（已完成）

- 7 个旧 Story/Storyboard/Preflight DB 写入口已退役，统一指向 G2 modern API；角色解析入口明确交给后续 Character/Asset 阶段。
- 定向 21 项、server 全量 54 文件/362 测试、Scrutiny、Runtime 及全量静态门禁通过。
- capability 由 8/36/5 变为 8/36/4；下一阶段进入 P4 D2-A3-2A，仍不触碰 Outbox consumer、final importer、M6 或真实 cutover。

## P4 D2-A3-2A（Character/Asset，进行中）

- `extract_characters` 与 `update_character` 已进入 DB Character 直写 + refresh；legacy workspace 隔离证据通过。
- `queue_character_reference` 已进入 DB 持久 GenerationTask + Character source freeze，支持同输入幂等重放，不调用 provider、不写物理图片。
- worker 已接入 `character_reference_generate`：fake handler 证据覆盖 claim/source fencing、staged→ready Asset、CharacterVisual 与 preview 指针；迟到结果保留 historical。
- `confirm_character_preview` 与 `confirm_character_reference` 已接入 DB：preview/final pointer、状态与层级规则均有 fresh SQLite 证据。
- scene reference worker 已接入 DB completion：staged→ready Asset、SceneVisual 和 currentVisual source fencing 有 fresh SQLite 证据。
- 公开 `queue_scene_reference` 已接入 ChapterScene source projection、持久 task 与 replay；新增 `P4-SCENE-01`。
- 定向 30 项、server 全量 54 文件/371 测试、Scrutiny、Runtime 和静态门禁全部通过；该切片随后已并入独立提交链。
- Character/Asset aggregate 仍 partial，`blockedIds` 保持 4；下一步处理 Character delete 或 CandidateLock，不能跳到 M6。
- `lock_candidate` 已接入 DB CandidateLockRevision 线性事务与幂等 replay；CandidateLock 完成，但 Character delete、`complete_chapter_images` 仍未开放。
- `complete_chapter_images` 已接入 DB：有效 current preflight + 全镜 current lock 后以 Chapter CAS 推进 `images_done`；Character delete 仍受 Outbox 约束未开放。
- 本片回归：定向 30/30、server 相关 371 条通过；默认 Vitest 5 秒阈值下 3 条已有 G1/M5 慢测超时，使用 30 秒阈值复核为 G1 12/12、M5 33/33 全通过，非本片断言回归。
- 参考图旧入口已合规 retired：`ensure_character_previews`、`generate_character_reference`、`generate_scene_reference` 均稳定 409 并指向 queue replacement；新增 P4-LEGACY-01，定向 31/31。

## 当前接管点（2026-07-13，已纠偏）

- 当前已提交 HEAD 为 `075986f`；D2-A6 Outbox/Project delete 已独立提交并复核，capability 已为 8/36/0。
- 工作树不再存在 D2-A5 未提交草稿；P7 的 DB thread/message/tool/pending/session、restart、maintenance/deleting fence 证据已计入 capability。
- 继续施工按 `luna_execute_all_remaining.md` 的 M6 部分执行；不得重复 P7/P8/D2-A7/A8。

## P5 Character delete intent（2026-07-13）

- DB 删除入口已从 unsupported guard 切换为事务 intent：Character current/preview 解引用、CharacterVisual→removed、Asset→deleting、`asset.delete` OutboxEvent 同事务提交。
- 保护规则覆盖 active project、同 scope、image/character_reference、sha256、Candidate/LayoutSourceBinding/ExportArtifact 历史引用和 in_use 主视觉。
- 新增 `P5-CHAR-DELETE-01/02`；fresh SQLite + 临时 workspace 通过，证明唯一 event、重复请求、物理文件不变和锁定拒绝。
- P5 仍不更新 capability registry；物理删除与 processed fencing 由 P8 Outbox consumer 完成后再回补 evidence。

## P6 Layout/Export DB-only（2026-07-13）

- `build_layout` 已切换 DB 分支：只读取 current Preflight、active Shot、current CandidateLock、ready Asset，生成带 `sourceBindings` 与 `sourceLockSetDigest` 的 `LayoutWorkingCopy`；同一锁集重放不改写 row/digest，锁集变化走 rowVersion 更新。
- `export_layout` 已实现 append-only `LayoutRevision` + `LayoutSourceBinding` 封存；binding seal、Chapter current pointer、milestone 推进在同一事务内完成。物理 `layout.json` 只写受控 workspace 的 temp 文件并 fsync→rename。
- `ExportRevision(layout_publication)` 从 queued 到 ready，`ExportArtifact` 只引用 staged→ready 的 document Asset；manifest/profile/renderer/preflight/source digest 均落 DB。
- `export_asset_package` 从 DB LayoutRevision/bindings/ready Asset 生成受控目录和 manifest，并登记 `ExportRevision(kind=asset_package)` 与 archive Artifact；缺文件 fail-closed，重放不重复创建 layout revision。
- 定向 `P6-LAYOUT-EXPORT-01`、项目 DB 全量 28/28 通过；typecheck 与既有 file-mode characterization 通过。P6 不触碰真实 workspace、provider 或凭据。
- P6 capability 三 operation 已改为 implemented；Character delete 物理清理由 P8 负责，因此总 `blockedIds` 从 4 降至 3，不能提前改绿 Character aggregate。

## P7 Dialogue runtime 接管点（历史记录，已完成）

- 当时曾存在未提交的 Dialogue DB 草稿；该状态已由后续 P7 收口覆盖，不再是当前入口。

## P7 Dialogue runtime DB 闭环（2026-07-13）

- 已完成 thread/message/tool result/pending artifact/runtime session 的 DB 持久化、digest/redaction、restart 收口、maintenance/deleting fence。
- `P7-DIALOGUE-DB-01`、项目 DB 29/29、server 全量、typecheck/web build、Prisma/G1、diff check 通过。
- capability `dialogue_pending_runtime` 已更新为 implemented/restartCovered=true；真实 `blockedIds` 从 3 降至 2。
- P7 已独立提交 `fa26908`；当前进入 D2-A6 Outbox + Project delete，并回补 Character delete。

## P8 D2-A6 Outbox 与 Project delete（2026-07-13，已完成）

- 新增 `ProjectDeleteOutboxService`：严格 payload、digest/scope/path/sentinel 校验，claim/heartbeat/lease recovery、retry backoff、terminal 不重开。
- DB 删除 API 先写 `project.delete_files` intent，active 状态先解引用 current 指针再 CAS 进入 deleting；服务重启后可继续处理，processed file event 后才允许 purge。
- 五类事件已具备 handler：`asset.promote`、`asset.delete`、`project.delete_files`、`secret.delete_old_ref`、`legacy_metadata.archive`。Character delete physical cleanup 已由 `asset.delete` 闭合。
- P8 定向 5/5、capability registry 5 项复核通过、server typecheck 通过；真实 CLI 为 8 capability/36 operation/`blockedIds=[]`。
- 默认 server 全量并发命令有 13 个历史慢测在 5 秒阈值下 timeout；备份/G1 慢测提高到 30 秒独立运行 45/45 通过，P8 用例在全量运行中全部通过。
- P8、D2-A7、D2-A8 均已通过并独立留痕；下一步是 M6 工具实现与隔离 C0～C7。

## P11 M6 tooling 与 C0-C7 临时根演练（2026-07-13）

- 新增 `DbActivateService`/`db:activate`：ACT-08、final source/effective identity、release manifest、capability、sealed backup 均 fail-closed；dry-run 零 DB 写，execute 原子写 `ready_for_activation -> db_only`，不写首笔业务时间。
- `PrismaService.runBusinessTransaction` 统一 ProjectRepository 三条 DB 写路径：首笔 DB-only 业务事务内设置 `firstBusinessWriteAt`，异常回滚不留时间戳；ready/recovery 拒绝写入。
- 新增显式 file bridge guard、metadata-only archive 和严格 C0-C7 `CutoverCoordinator`。
- M6 定向 5 files/12 tests；服务端全量 59 files/403 tests；workspace typecheck、web build、Prisma/G1/diff check 全部通过。
- 临时根 C0-C7 rehearsal 8/8 通过，最终状态 `db_only` + 首写时间；未触碰真实环境，真实切换仍停在授权边界。
