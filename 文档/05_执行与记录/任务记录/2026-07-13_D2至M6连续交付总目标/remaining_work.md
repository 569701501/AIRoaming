---
doc_id: AIR-D2-M6-REMAINING-WORK-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前 36 个 capability operation、Prisma 44-model substrate、D2/M6 路线与 G1 验收
---

# D2 至 M6 剩余工作全量拆解

## 1. 总览

| 阶段 | 核心结果 | blocker 预期 |
| --- | --- | ---: |
| P0 基线 | 已完成；已提交基线为 HEAD `73cc76f`，当前真实 report 为 3 blocker | 3 |
| P1 D2-A2-1 | 已完成：Project metadata、ensure chapter、AI pending、Outline、Web G2 Script | 4 |
| P2 D2-A2-2 | 已完成：clear/import/reset 安全语义与旧操作退役机制 | 4 |
| P3 D2-A3-1 | 已完成：Story/Storyboard/Preflight 公开 DB 闭环 | 4 |
| P4 D2-A3-2A | Character/Scene identity、queue/worker、Asset/Visual、公开确认；旧同步 generate/ensure 已 retired，delete 进入 Outbox 依赖 | 4 |
| P5 D2-A3-2B | CandidateLock、complete images、旧参考图入口退役和 Character delete DB intent 已完成；物理清理由 P8 Outbox 收口 | 3（依赖 P8 才降） |
| P6 D2-A4 | 已完成并提交 `73cc76f`：LayoutWorkingCopy、LayoutRevision/source binding、layout export、asset package；Character delete 物理清理仍由 P8 收口 | 3 |
| P7 D2-A5 | 当前接管点：Dialogue runtime DB 事实源；工作树有未提交草稿，尚未形成正式 evidence | 3（通过后降至 2） |
| P8 D2-A6 | Project delete、Outbox consumer、五 handler，并回补 Character delete | 0 |
| P9 D2-A7 | full final importer、verify、ready coordinator | 0 |
| P10 D2-A8 | 双 fresh/replay/WIT/secret/capability 总证据 | 0 |
| P11 M6 tooling | activate/cutover/rollback 实现与隔离 C0～C7 演练 | 0 |
| P12 总收口 | `ready_for_real_cutover_authorization` | 0 |
| R1 真实切换 | 用户另行授权后执行真实 C0～C7 | 0 |

## 2. P0：基线与控制面

必须：

- 确认工作树无未识别改动；当前已知有 D2-A5 未提交草稿，只能先审查后收口，不得把它当完成证据。
- 记录 `git rev-parse HEAD`；已提交基线应为 `73cc76f`。
- 执行 capability report，断言 8 个聚合项、36 个 operation、当前 3 个 `blockedIds`；后续只接受真实 report 的下降。
- 确认第 36 个操作 `generation_task_create` 已由 `task_create_claim_complete_cancel_recover` 的公开 DB guard 证据完成；后续阶段只做回归，不得改回 partial/unsupported。
- 确认 `db:import --kind final` 仍在 Prisma 初始化前返回 `MIGRATION_FINAL_IMPORT_NOT_READY`。
- 确认 package scripts 尚无 `db:activate`，作为后续实现基线。
- 建立 `execution_status.md`，记录每阶段 `pending/in_progress/passed/blocked`、commit 和证据。

退出：基线事实与本文一致；不修改业务状态。

## 3. P1：D2-A2-1 非破坏性 Project/Chapter/Script

以既有五份施工资料为详细契约：

```text
文档/05_执行与记录/任务记录/
  2026-07-13_D2-A2-1非破坏性公开写闭环/
```

必须完成 5 个 operation：

- `update_project_draft`
- `ensure_chapter_exists`
- `write_chapter_draft_from_ai`
- `save_script_outline_from_ai`
- `confirm_script_outline`

并完成：

- `ProjectScriptCommandRepository` 或同等深模块。
- AI 结果只创建 `ChapterScriptPending/Revision`，采用只写 Working Copy，Publish 才创建 `ScriptVersion`。
- Web 在 `g2_db` 模式使用 Working Copy/Publish/Pending Suggestion 新接口。
- observed CAS、同进程 identity map refresh、Nest restart、旧 workspace mutation isolation。
- DB 模式旧 draft/complete/source-pending 路由稳定拒绝并返回 replacement。

退出：

- 两个相关聚合项仍为 partial。
- `blockedIds` 仍精确为 6。
- 不进入 clear/import/reset 语义。

## 4. P2：D2-A2-2 clear/import/reset 与退役语义

### 4.1 待关闭的 7 个 operation

- `clear_project_chapters`
- `clear_legacy_story`
- `clear_chapter_script`
- `confirm_chapter_pending_source`
- `discard_chapter_pending_source`
- `import_script_to_chapters`
- `reset_project_script`

### 4.2 统一规则

- DB 模式不得物理删除 Chapter、ScriptVersion、confirmed/archived Outline 或任何下游 formal history。
- milestone 只能单调前进，不得为了“重置”回退。
- 清空 Working Copy 必须走 G2 observed CAS；旧 `clear_chapter_script` 可退役到新接口。
- 旧 source-pending confirm/discard 必须退役到 G2 pending adopt/discard。
- `clear_project_chapters` 与 `clear_legacy_story` 是 file-mode 内部目录动作，在 DB 模式必须明确退役，不能伪造成功。
- bulk import/reset 必须先给影响预览；有正式历史时不得隐式覆盖。实现者应提供保留历史的安全替代流程，或稳定拒绝并给出可执行 replacement。
- 一个 operation 只有在“真实实现”或“正式退役且 replacement 覆盖用户意图”时才算关闭。

### 4.3 capability registry 升级

允许将操作状态扩为：

```ts
type OperationWriteStatus =
  | "implemented"
  | "retired"
  | "partial"
  | "unsupported";
```

`retired` 必须同时有：

- `retirementReason`。
- `replacement`。
- 公开 API 稳定拒绝测试。
- replacement 成功路径测试。
- restart/isolation 证据。

blocked 计算只能把满足全部退役条件的 operation 视为已关闭；不得把普通 409 拒绝当成绿灯。

### 4.4 schema 决策

优先使用现有 Working Copy、pending、append-only revision 和 lifecycle 约束。若确有证据必须补 schema：

- 新增 ADR-0016 或下一个空闲编号。
- 只能新增 0011+ 小型 migration。
- 不修改 0001～0010。
- 不引入物理历史删除或 milestone 回退。
- migration 必须 fresh/replay/rollback-compatible 检查。

退出：

- `project_chapter_script` read/write implemented、restartCovered=true。
- 10 个 operation 均 implemented 或合规 retired。
- `blockedIds` 从 6 精确降至 5。

## 5. P3：D2-A3-1 Story/Storyboard/Preflight

关闭 7 个 operation：

- `confirm_story_structure`
- `update_story_structure`
- `confirm_image_preflight`
- `resolve_image_preflight_character`
- `save_pending_storyboard`
- `confirm_storyboard`
- `update_storyboard`

实现要求：

- 复用现有 `StoryVersionRepository`、`StoryboardVersionRepository`、`PreflightRevisionRepository`，禁止整棵 `LocalProject` diff 写库。
- Story/Storyboard 权威 document、projection、current/pending 指针必须同事务。
- confirmed 文档不可原地覆盖；更新创建新版本。
- 用户确认必须携带实际观察到的 pending/current ID、rowVersion 和 source digest。
- Preflight ready 由服务端基于 current Storyboard、CharacterVisual、SceneVisual、Asset 和策略版本重算，拒绝客户端伪造。
- 新上游正式版本产生后，下游按 G2 freshness 变 stale，不删除旧历史。
- 同进程快照与重启一致；旧 `structure.json/storyboard.json/preflight.json` mutation 不影响 DB DTO。

退出：

- `outline_story_storyboard_preflight` 全部 operation 有证据。
- 聚合 capability 绿。
- `blockedIds` 从 5 精确降至 4。

## 6. P4/P5：D2-A3-2 Character/Scene/Asset/CandidateLock

### 6.1 P4：Character/Scene reference 与 Asset/Visual

已完成：

- `extract_characters`
- `update_character`
- `queue_scene_reference`
- `queue_character_reference`
- `confirm_character_preview`
- `confirm_character_reference`
- `scene_reference_generate` worker completion
- `character_reference_generate` worker completion

仍待收口：

- `ensure_character_previews`：明确替换为角色 identity/queue 工作流，或实现 DB 公开批量 queue。
- `generate_character_reference`、`generate_scene_reference`：同步旧入口不得在 DB 直接出图；应退役并指向 queue + worker，补稳定拒绝和 replacement 证据。
- `delete_character_reference`：需要 Outbox 物理清理意图、claim/lease/postcondition 和引用历史保护；在 D2-A6 Outbox consumer 前不得假完成。

要求：

- Character 文本身份只写 `Character`；`ProjectContextFact` 只能派生。
- 生成先创建持久 `GenerationTask` 和冻结 source，worker 完成后以 claimToken/target/source digest fencing。
- 物理图片先写受控 staging，校验 sha256/bytes/MIME/dimensions，再通过 Outbox/事务意图 promote 为 ready Asset。
- CharacterVisual/SceneVisual 与 Asset、Project、Chapter scope 严格一致。
- 替换视觉创建新版本；已被 Candidate 使用的旧 Visual/Asset 不覆盖。
- 删除角色参考图只撤销/清理允许的当前视觉，不删除 Character 和已引用历史；需要物理清理由 Outbox 处理。
- provider 只用 fake；错误、Task、Asset meta、日志通过公共 redactor。

P4 完成后聚合项仍可 partial，`blockedIds` 保持 4。

### 6.2 P5：CandidateLock 与章节图片完成

已完成：

- `lock_candidate`
- `complete_chapter_images`

要求：

- lock 创建不可变 `CandidateLockRevision`，验证 Candidate/Shot/Task/Asset 同 scope。
- 迟到任务只能留下 historical Candidate，不能改变 current lock。
- replace lock 创建新 revision，旧 Layout/Export 不改写，只按 source lock set 变 stale。
- complete images 只在每个 required Shot 均有 current lock、Asset ready、source fresh 时推进 milestone。
- 同进程、restart、双客户端冲突和旧文件隔离通过。

当前退出条件：

- CandidateLock、complete images、旧同步入口和 Character delete intent 已具备真实证据；仍需 Outbox consumer 的物理清理证据。
- 在 P8 之前保持 `character_scene_asset_candidate_lock=partial`、`blockedIds=3` 是正确状态；不得为了推进 P6/P7 先改 registry 数字。
- P8 完成 Outbox 后必须回头补 `delete_character_reference` evidence，届时该 capability 才能绿；如果 P6/P7 已完成，blockedIds 会按真实 capability report 一次降至 0。

## 7. P6：D2-A4 Layout/Export

状态：已完成（2026-07-13）。代码与证据已在当前分支；下一阶段为 P7 Dialogue，不能跳过 P8 的 Outbox/Project delete 收口。

关闭：

- `build_layout`
- `export_layout`
- `export_asset_package`

### 7.1 Layout

- `LayoutWorkingCopy` 是可编辑事实，使用 rowVersion CAS。
- seal 创建 append-only `LayoutRevision` 和完整 `LayoutSourceBinding`。
- document、binding、binding count、sourceLockSetDigest、seal/current 指针同事务。
- source-backed 元素必须绑定同一 Shot→Candidate→LockRevision→Asset provenance。
- stale Layout 保留历史，不覆盖为 fresh。

### 7.2 Export

- 先创建 `ExportRevision(status=running/pending)` 或既有合法初态，再执行物理渲染。
- 物理文件写入 staging，fsync/rename 后校验摘要；`ExportArtifact` 只引用 ready Asset。
- manifest、profile、rendererVersion、preflight/source digest 完整后才可 ready/current。
- ready Export/Artifact 不可改写。
- 素材包从 DB 文档、关系和 Asset storage 生成，不再扫描旧业务 JSON/Markdown。
- Asset 字节是允许的物理边界；metadata、current、provenance 必须在 DB。

退出：

- `P6-LAYOUT-EXPORT-01` 覆盖 LAY/EXP 的 DB 事实链、物理 staging→fsync→rename、ready Artifact、素材包和 replay；项目 DB 28/28 与 typecheck/file-mode characterization 通过。
- `layout_export` 已改为 implemented；独立 capability/restart 总证据仍需在 P10 汇总，当前 `blockedIds` 为 3（Character delete、Dialogue、Project delete/Outbox）。

## 8. P7：D2-A5 Dialogue runtime

关闭聚合项 `dialogue_pending_runtime`。

要求：

- `ConversationThread`、`ConversationMessage`、`DialogueToolResult`、`DialogueRuntimeSession`、`PendingDialogueArtifact` 为正式事实源。
- 用户消息与 assistant running 占位先落 DB，再调用 provider。
- tool result 与 pending artifact 同事务或有可恢复 intent，禁止只存在 Map。
- 进程内只保留活动 stream、AbortController、短期投影；不得作为可恢复事实。
- 重启时 running assistant/session 进入 interrupted/failed，不能永久 running。
- pending Script/Outline/Story/Storyboard 工件可在重启后继续采用/丢弃。
- DB 模式读取不依赖 runtime bundle；runtime bundle 只服务迁移/回滚封口。
- fake provider、secret redaction、maintenance draining/closed、project deleting fence 全部覆盖。

退出：

- REP-08、REP-09 与 restart/pending/tool replay 通过。
- `dialogue_pending_runtime` 绿。
- `blockedIds` 从 2 精确降至 1。

## 9. P8：D2-A6 Project delete + Outbox

关闭 `delete_project` 和 `project_delete_outbox`。

### 9.1 Outbox runtime

实现独立 repository/worker/consumer，覆盖 5 类已冻结事件：

- `asset.promote`
- `asset.delete`
- `project.delete_files`
- `secret.delete_old_ref`
- `legacy_metadata.archive`

必须实现 strict payload codec、idempotency key、claim/heartbeat/lease fencing、5/30 秒 backoff、最多 3 次、过期恢复、postcondition probe 和 terminal 状态。

### 9.2 Project delete

- 公开删除请求在一个 DB 事务内把 Project 置为 deleting、写 `deletingAt`、取消可取消任务并创建 `project.delete_files` intent。
- deleting 后根写栅栏覆盖所有 mutation、Task create/claim/retry、Asset promote、current/pending pointer。
- handler 幂等删除该项目 metadata 物理目录；Asset storage 按 ownership/事件处理，不越界其他项目。
- 文件已删但 DB 未完成、删一半、响应丢失、worker 重启都能重放。
- 只有 deleting + processed delete event + 无 active runtime task 才允许 DB purge。
- 迟到 provider/task 不得重建目录或注册 ready Asset。
- Dialogue runtime、Settings secret old ref 清理与 Project delete 都必须走相同 Outbox 事实。

退出：

- OTB-01～05、DEL-00～05 全绿。
- `project_delete_outbox` 绿。
- `blockedIds` 从 1 精确降至 0；`db:capabilities --check` 退出 0。

## 10. P9：D2-A7 full final importer

### 10.1 final runner

- 复用已验证的 16-slice dependency order 和 mapper，不复制另一套业务转换逻辑。
- final 只接受 sealed snapshot、有效 decisions、显式空目标 DB/roots、全绿 capability 和 fake/受控 SecretStore。
- 产生一个权威 `MigrationRun(kind=final)`；其 report 必须覆盖全部 16 slice、每 slice count/digest/status、source/snapshot/decisions/effective identity。
- 任一 slice blocked/failed 时 final run 终态失败/阻塞；不写 ready state，不运行下游激活。
- final replay 对同一 identity 幂等；不同 source/decisions 冲突 fail-closed。

### 10.2 final verification

- integrity_check=ok、foreign_key_check=0。
- ledger、ImportedEntitySource、issue、entity count、current/pending 指针、Asset bytes 全部核对。
- 公开 DTO 与 file fixture 的规范化语义一致。
- secret sentinel 覆盖 DB、settings、migration report、日志、Task、Artifact、Export 和 workspace fixture。
- settings 脱敏必须保持 temp→fsync→rename；失败旧文件字节不变。

### 10.3 ready coordinator

只有同时满足以下条件才单事务写 `ready_for_activation`：

- final run succeeded。
- open blocker=0。
- capability blocker=0。
- source/effective identity 精确匹配。
- final verification passed。
- SecretStore prestage 可读且 sentinel=0。
- activatedAt/firstBusinessWriteAt 仍为 null。

退出：临时根 final runner、verification 和 ready coordinator 全绿；仍不操作真实数据。

## 11. P10：D2-A8 综合见证

必须使用正式 CLI/Service，不用测试捷径：

- 两个独立 fresh 临时根完成 snapshot→decisions→final import→verify。
- 两轮规范化 entity ID、report digest、inventory digest 一致。
- 同一目标 replay 零新增、零覆盖正式历史。
- Nest 至少重启一次，七阶段已实现 DTO、pending、Dialogue、Task、Asset、Layout、Export 语义一致。
- 移走/篡改旧 metadata 后 DB API 不变；DB 写不重建旧 metadata。
- ready Asset sha256/bytes 与来源一致。
- capability report 8 项全绿、36 operation 全闭合、blockedIds=[]。
- SEC sentinel 全范围为 0。
- server 全量、workspace typecheck、Prisma/G1、`test:all`、临时 E2E 全绿。

退出：状态 `d2_passed`，允许自动进入 M6 工具实现与隔离演练。

## 12. P11：M6 工具实现与隔离 C0～C7 演练

### 12.1 必须实现

- `CutoverCoordinator` 或同等编排器。
- `db:activate --dry-run|--execute`。
- 当前 release effective manifest identity 读取。
- DB maintenance read/API/rollback smoke。
- metadata-only archive handler/命令。
- firstBusinessWriteAt 的业务事务钩子。
- file bridge 在激活后或 first write 后拒绝启动。
- rollback_restore 账本/summary。

### 12.2 隔离演练顺序

```text
C0 生成 bridge release fixture，检查全门禁
C1 同进程 drain/closed/runtime bundle
C2 final snapshot + coordinated/pre-cutover 备份恢复演练
C3 fresh DB + fake SecretStore prestage
C4 final import/verify + settings 脱敏 + ready
C5 DB maintenance start + read/API/rollback smoke
C6 临时 metadata-only archive，Asset storage 保留
C7 临时 DB activate execute + reopen writes
```

全流程只在带 marker 的临时三根执行。C0～C7 不并行。

### 12.3 回滚

- C4 前失败：旧同 PID file fixture 可 reopen。
- ready、firstWrite=null：恢复 snapshot/runtime bundle。
- db_only、firstWrite=null：恢复 sealed backup。
- firstWrite 非空：file-only 启动拒绝，只允许兼容 DB 或 coordinated backup restore。
- 不提供自动 down migration。

退出：

- ACT-01～09、RB-01～06、适用 RST/FLT 全绿。
- 临时 C0～C7 演练通过。
- 真实环境零触碰。
- 状态 `m6_tooling_passed`。

## 13. P12：总收口

必须生成：

- 总进度摘要。
- capability 最终报告摘要。
- final/replay/WIT 摘要。
- C0～C7 隔离演练摘要。
- 最终 Scrutiny Review。
- 最终 Runtime Review。
- 功能完成记录。
- `real_cutover_handoff.md`，列出真实切换需要用户提供/确认的根、备份位置、维护窗口、release commit 和回滚负责人。

最终提交后停止，状态：

```text
ready_for_real_cutover_authorization
```

## 14. R1：真实切换（本轮不执行）

只有用户明确授权真实 workspace、真实 DB、真实 SecretStore、维护窗口和 `db:activate --execute` 后，才可按 C0～C7 执行。

R1 不是本轮连续开发授权的一部分，但全部步骤和入口必须在 P11/P12 中准备好，使用户届时只需做一次 go/no-go。
