---
doc_id: AIR-RCUT-R0B-REMEDIATION-HANDOFF-001
status: ready_for_authorization
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: luna, orchestrator, migration-reviewer, release-owner
source: R0-B 只读发现、两次 release-specific shadow 与恢复备份只读核对
---

# Luna R0-B 阻塞修复 Handoff

## 1. 任务结果

Luna 本次不是“再看一次阻塞”，而是连续完成以下闭环：

```text
迁移器兼容修复
  -> 临时 overlay 恢复候选验证
  -> 两个 fresh overlay shadow 全绿
  -> 原子补回真实源唯一缺失文件
  -> 固定 remediation commit 的外置 release worktree
  -> 两个 fresh real-source shadow
  -> SH-01～SH-09 落证
  -> 停在 SH-10 等待人工 Migration reviewer
```

目标状态：

```text
R0-B = remediation_executed_waiting_human_SH10
SH-01..SH-09 = passed_release_shadow
SH-10 = awaiting_human_migration_reviewer
AUTH-C1/C5/C7 = not_generated
C0..C7 = not_run
```

## 2. 当前已确认事实

1. 当前真实源章节缺少：
   `workspace/projects/3c91668b-03db-4022-a9cd-5b130205c14f/chapters/chapter-001/structure.json`。
2. 仓库内只读恢复备份存在：
   `workspace/recovery-backups/2026-07-10-150041-chapter-001-before-recovery.tar.gz`。
3. 备份文件 SHA-256：
   `336c9f470c177e32473d01a2e1bd4f8c61101d8f23eea9117bbad85eca4b6f23`。
4. 备份成员 `chapters/chapter-001/structure.json` SHA-256：
   `4eac7b63c79fa5408f19000aae1c3e4e6d56989bb562a6947f81003b076a0dd3`，字节数 `22819`。
5. 候选结构的 project/chapter/story/script identity 与当前 `chapter.json`、`storyboard.json` 一致；12 个 `projectCharacterId` 全部唯一并能对应当前 `shared/characters.json` 的 12 个 legacy character id。
6. 仅把该文件放入临时 overlay 后，Story importer 会因 43 个 beat character token 使用角色名而失败；43/43 均可按唯一精确角色名解析，0 缺失、0 歧义。
7. 当前真实 storyboard 有 15 个 shot、65 个 character token；65/65 均可按 `shared/characters.json` 的唯一精确角色名解析，0 缺失、0 歧义。
8. 当前 full shadow 顺序是 `story -> storyboard -> characters`，无法支持 storyboard 的正式 Character 外键；必须改成 `story -> characters -> storyboard`。
9. 当前 `StoryboardShadowImporter` 遇到任何非空 `characterIds` 都直接失败，并且没有创建 `storyboard_shot_characters`；这是代码阻塞，不是源数据错误。
10. 当前 source workspace 位于开发仓库内，直接把仓库根当 `releaseRoot` 会触发 `CUTOVER_PLAN_ROOT_OVERLAP`；解决方式是从最终 remediation commit 创建仓库外、只读固定的 release worktree，不能复制 workspace 冒充真实源。

## 3. 给 Luna 的单条目标与授权文本

用户应把本文件路径连同以下完整文本交给 Luna；没有这段授权，Luna 只能做到临时 overlay 验证，不能写真实源：

```text
执行《Luna R0-B 阻塞修复 Handoff》全部阶段。

授权范围：
1. 允许修改并独立提交 migration importer 兼容代码、测试和本任务留痕文档；不得夹带当前工作树中无关的用户修改。
2. 允许从最终 remediation commit 在当前仓库外创建固定、干净、可复现的 release worktree，并只使用离线锁定依赖；不允许网络升级依赖。
3. 允许先在仓库外临时 overlay 中恢复指定备份成员并执行两个 fresh shadow。
4. 只有临时 overlay 双 shadow、定向测试、服务端全量和静态门禁全部通过后，才允许从指定 recovery backup 原子新增真实源中当前缺失的唯一 structure.json；禁止覆盖、删除、改写任何其他真实源文件。若目标已存在、备份或成员摘要变化、identity 不匹配、源前置摘要变化或出现新 blocker，立即停止。
5. 允许基于补齐后的真实源生成 sealed snapshot，并执行两个 fresh release-specific shadow、SH-01～SH-09 和脱敏留痕。

不授权：停写、默认用户 Keychain、真实凭据读取或写入、AUTH-C1/C5/C7、C0～C7、final importer、真实目标激活、archive、删除旧数据、down migration、G4/G5。

完成后必须停在 SH-10，交给人工 Migration reviewer；Luna 不得自签 SH-10，也不得自动进入 C0 或申请 AUTH-C1。
```

## 4. 必读顺序

1. 本文件。
2. `r0b_blocker_remediation_contract.md`。
3. `r0b_blocker_remediation_test_matrix.md`。
4. `r0b_blocker_remediation_file_map.md`。
5. `r0b_blocker_remediation_review_checklist.md`。
6. `handoff.md`、`task_plan.md`、`findings.md`、`progress.md`。
7. `evidence_and_test_matrix.md` 第 7 节。
8. `文档/06_测试与验收/G1数据库迁移执行与验收清单.md` 的 SH-01～SH-10。

## 5. 连续执行阶段

### P0：基线保护

- 记录当前分支、HEAD、dirty files；不得全量暂存。
- 当前用户无关修改一律保留，不格式化、不回退、不提交。
- 核对真实源目标仍不存在、备份和成员摘要仍等于 §2。
- 任一前置不一致，状态写为 `blocked_precondition_changed` 并停止。

### P1：红灯与兼容实现

先补测试，再实现：

1. 新增纯函数 legacy character reference resolver。
2. Story beat token 支持“结构角色 ID 或唯一精确角色名”解析到 StoryDocumentV2 character card id。
3. Full shadow 把 `characters` 移到 `storyboard` 前。
4. Storyboard token 支持“shared legacy character ID 或唯一精确角色名”解析到稳定 DB Character id。
5. Storyboard importer 在确认版本前创建完整 `storyboard_shot_characters`，支持 replay 且不重复。
6. 未知、歧义、目标 Character 缺失全部 fail-closed，不允许猜测、丢弃或清空引用。

完成 P1 后先执行定向测试；未全绿不得进入 P2。

### P2：全量门禁与独立代码提交

- 执行服务端全量、typecheck、server/web build、Prisma、G1、capability 和 `git diff --check`。
- 做一次只读 Scrutiny：特别检查源 token 未被静默丢弃、外键和 child row 在确认前完成、replay 一致。
- 只提交本施工包列出的实现、测试和文档；记录 commit SHA。
- 后续 release worktree 的 `appCommit` 必须是这个最终 remediation commit，不得继续使用旧 `3fda7d0`。

### P3：外置固定 release worktree

- 在 source workspace 与当前仓库之外创建 detached worktree，固定到 P2 commit。
- worktree 必须 clean；使用 lockfile 和本地 store 离线安装依赖，禁止升级。
- 在该 worktree 重新跑 release freeze 门禁，并分别计算 G1 baseline machine manifest digest 与 release effective schema identity。
- 本 release 的 G1 baseline digest 应为 `sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`，release effective schema identity 应为 `sha256:2e9992459906946415f8072ef4ad210ba00c52393d6c83fc4d0af23e415b3559`；任一不符都停止并请求审阅。plan/gate/C0 只能绑定后者。
- 后续所有 shadow/verify/backup-restore 命令必须从该固定 release worktree 执行。

### P4：临时 overlay 证明

- 复制真实源到仓库外唯一临时 overlay；不修改真实源。
- 只从已核验备份提取一个 `structure.json` 到 overlay。
- 对 overlay 生成新的 sealed snapshot 和 decisions。
- 在两个全新、互不复用的 SQLite/data/workspace 根执行 full shadow。
- 必须满足：16 slices 全部 succeeded、blocker=0、两个规范化 reportDigest 相同、表计数摘要相同、integrity/FK/secret scan 全绿。
- 任一失败，保留脱敏失败证据，禁止进入 P5。

### P5：真实源单文件原子恢复

仅在授权文本已明确给出且 P0～P4 全绿时执行：

- 再次核对目标不存在、源前置 manifest 未被并发改动、备份和成员摘要不变。
- 提取到目标目录内的唯一临时文件，写入后 fsync；使用 no-clobber 原子发布，目标出现竞态时必须失败；fsync 目录后清理临时文件。
- 发布后的目标摘要必须精确等于
  `4eac7b63c79fa5408f19000aae1c3e4e6d56989bb562a6947f81003b076a0dd3`。
- 对除新增目标外的真实源文件做 pre/post manifest 对照，必须字节不变。
- 不提交、复制或打印真实 JSON 内容；该文件位于 gitignore 的真实 workspace 中，不加入 Git。

### P6：真实源 release-specific shadow 与 SH-01～SH-09

- 从补齐后的真实源只读创建全新 sealed snapshot。
- 使用 P3 release worktree 和两个 fresh 目标重跑 full shadow。
- 完成矩阵中 SH-01～SH-09；SH-09 只针对 fresh shadow target 做 release-specific backup/restore rehearsal，使用隔离 credential evidence，不访问真实 Keychain、不运行 real final importer。所有私有绝对路径只写仓库外证据，仓库文档只记 digest、计数、状态和脱敏结论。
- 生成 SH-10 人工审阅包，但状态只能是 `awaiting_human_migration_reviewer`。

### P7：留痕与停止

- 更新本任务 `progress.md`、`findings.md`、`task_plan.md`、`evidence_and_test_matrix.md` 和会话记忆。
- 如需提交执行留痕，单独提交，不改 P3 release worktree 绑定的 appCommit。
- 明确记录真实源只新增了一个被授权文件；默认 Keychain、真实凭据、停写、AUTH、C0～C7 操作次数均为 0。
- 停在 SH-10，不继续。

## 6. 强制停止条件

遇到任一条件立即停止：

- 备份文件、成员摘要、项目/章节/story/script identity 与本文不一致。
- 真实源目标已存在，或源文件在 P5 前发生并发变化。
- 需要覆盖/删除任何真实源文件。
- legacy character token 出现 0 个或多个候选。
- overlay 双 shadow 不完全一致或仍有 blocker。
- 需要修改 Prisma schema、migration tree 或 trigger 才能通过。
- 外置 release worktree 不干净、需要联网升级、effective schema digest 变化。
- SH-01～SH-09 任一失败。
- 需要真实 Keychain、真实 credential、停写、AUTH 或 C0～C7。

## 7. Luna 交付格式

## 7.1 本轮执行结果（交给 Luna 时的当前基线）

本施工包已经按上述 P0～P7 由 Codex 执行到 SH-09，Luna 不需要重新猜测“做到哪一步”。如果 Luna 负责复核或重放，直接以以下固定基线开始：

1. remediation appCommit=`29f40bb`；前一代码修复提交为 `74a6d71`。
2. legacy preflight v1→V2 sourceSnapshot 兼容已实现，定向 74 tests、服务端 71 spec/483 tests 通过。
3. 真实源只新增授权 `structure.json`；除该新增文件外 source manifest 无差异。
4. real-source A/B fresh full shadow 为 16/16 succeeded，aggregate reportDigest=`sha256:daca7e92...663e781`，table-count digest=`sha256:25f14b5a...117fc0a`，open blocker=0。
5. SH-04～SH-09 已完成；SH-09 coordinated backup/verify-only/materialize restore 全通过，67 assets。
6. 首次 shadow 产生的 67 个 `legacy-import` 文件已清理；最终 shadow 使用隔离 target workspace，真实 source digest 保持 `sha256:c16ff088...4beebb`。

因此当前不是“等待 Luna 开发代码”，而是：Luna 若接手，只需复核 `r0b_remediation_execution_record.md` 与外置证据，准备人工 SH-10 审阅包；不得重复恢复真实源、不得生成 AUTH、不得进入 C0～C7。

```text
结论：remediation_executed_waiting_human_SH10 / blocked_<reason>
remediation commit：<sha>
release worktree appCommit：<sha>
代码范围：<files>
定向/全量门禁：<results>
overlay 双 shadow：<report digest / table-count digest / blocker>
真实源恢复：not_run / one_file_added；pre/post 其他文件差异=0
real-source 双 shadow：<report digest / table-count digest / blocker>
SH-01～SH-09：<逐项状态>
SH-10：awaiting_human_migration_reviewer
默认 Keychain/真实凭据/停写/AUTH/C0～C7：0
停止点：未进入 C0，未生成 AUTH-C1
```
