---
doc_id: AIR-RCUT-R0B-REMEDIATION-REVIEW-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: scrutiny-reviewer, runtime-reviewer, migration-reviewer, release-owner
source: R0-B 阻塞修复 Handoff、实施契约和测试矩阵
---

# R0-B 阻塞修复复核清单

## A. 授权与基线

- [ ] 用户给出的授权包含代码修改、外置 release worktree、overlay、条件式单文件真实源恢复和 real-source shadow。
- [ ] 授权明确排除停写、Keychain/真实凭据、AUTH、C0～C7、final/activate。
- [ ] 记录基线 HEAD 与 dirty files；没有全量暂存或覆盖用户修改。
- [ ] 备份 archive/member digest、size 与 Handoff 一致。
- [ ] 真实 target 在执行前不存在。

## B. Resolver 静态复核

- [ ] ID 精确命中优先于名称。
- [ ] 名称只接受唯一精确匹配。
- [ ] 0 候选和多候选分别稳定失败。
- [ ] 不做 lowercase、模糊、别名或数组位置猜测。
- [ ] token 顺序和重复项保持。
- [ ] helper 不做 I/O、不记录真实名称。

## C. Story importer

- [ ] beat characters 输出为 structure character card id。
- [ ] projectCharacterId 输出为稳定 DB Character id。
- [ ] unknown/ambiguous 不被包装成无法区分的成功或空数组。
- [ ] 同 snapshot replay 的 document/payload digest 稳定。

## D. Storyboard importer

- [ ] shared characters 从同一 verified snapshot 读取。
- [ ] legacy ID/name 解析为稳定 DB Character id。
- [ ] target Character 必须已存在且 project scope 正确。
- [ ] child row 在 version confirmed 前创建。
- [ ] child order/sourceToken/characterId 与 V2 document 完全一致。
- [ ] child id 确定性；replay 不增行且冲突 fail-closed。
- [ ] 非空人物引用不再被清空或无条件拒绝。
- [ ] report count/verify source evidence 没有 count mismatch。
- [ ] `StoryboardShotCharacter` 只作为 g3-m3-a6 contextual count，不被误登记成独立 source evidence。

## E. Full order 与回归

- [ ] 依赖顺序为 `story -> characters -> storyboard`。
- [ ] 仍为 16 slices，其他相对顺序不变。
- [ ] final、backup、restore、verify 的顺序消费测试通过。
- [ ] 定向、服务端全量、typecheck、build、Prisma/G1/capability/diff 全绿。
- [ ] Prisma schema、migration tree、trigger 均未修改。

## F. Release worktree

- [ ] detached HEAD 精确等于 remediation commit。
- [ ] worktree clean，位于 source workspace 和当前仓库外。
- [ ] frozen/offline dependency setup 未修改 lockfile。
- [ ] effective schema digest 与预期一致。
- [ ] 私有 cutover plan root check 不再出现 overlap。
- [ ] worktree 不会在 SH gate 后被提前删除。

## G. Overlay gate

- [ ] 候选身份、12 个 projectCharacterId 关系全部通过。
- [ ] overlay 只新增一个 structure.json，真实源字节/mtime 未变。
- [ ] shadow A/B 均为 fresh DB/data/workspace root。
- [ ] 两次 16 slices succeeded、blocker=0。
- [ ] reportDigest 与逐表计数摘要一致。
- [ ] 43 个 beat token、65 个 shot token 全部解析，无丢失/歧义。
- [ ] integrity/FK/open issue/secret scan 全绿。

若 G 任一项未勾选，下面 H/I 不得执行。

## H. 真实源单文件恢复

- [ ] P5 前再次核对 target absent、archive/member digest、identity、source pre-manifest。
- [ ] 临时文件同目录、fsync、no-clobber 原子发布、目录 fsync。
- [ ] 发生 EEXIST 或并发源变化时没有覆盖。
- [ ] 发布后 digest/size/identity 精确。
- [ ] source pre/post 差异集合仅含新增 target。
- [ ] 真实 JSON 未打印、未复制到仓库、未提交 Git。

## I. SH-01～SH-09 Runtime Review

- [ ] SH-01 两个 real-source fresh import。
- [ ] SH-02 report/table digests 一致。
- [ ] SH-03 blocker=0、16 slices succeeded。
- [ ] SH-04 integrity/FK/schema/source evidence 全绿。
- [ ] SH-05 API DTO 对照通过。
- [ ] SH-06 DB-mode restart 通过。
- [ ] SH-07 old metadata isolated mutation 通过。
- [ ] SH-08 global secret sentinel=0。
- [ ] SH-09 仅对 fresh shadow target 做 release-specific backup/restore rehearsal；真实 Keychain/credential/final importer 操作=0。
- [ ] 私有报告根权限受限，仓库只留脱敏摘要。

## J. 停止点

- [ ] SH-10 状态仍为 `awaiting_human_migration_reviewer`。
- [ ] Luna 未填写 reviewer 签名、未生成 shadow gate passed 文件。
- [ ] AUTH-C1/C5/C7 文件数=0。
- [ ] C0～C7 evidence step 数=0。
- [ ] 默认用户 Keychain、真实 credential、停写操作数=0。
- [ ] 没有自动领取 C0、R1、R2、G4/G5。

## K. Scrutiny 结论模板

```text
status: passed / changes_requested
reviewer: <独立复核者>
remediation commit: <sha>
checked files: <list>
R0B-REF/STORY/ORDER/BOARD/FULL: <result>
schema/migration/trigger changes: 0
unrelated user changes staged/committed: 0
blocking findings: <none or list>
```

## L. Runtime 结论模板

```text
status: passed_release_shadow / blocked
release appCommit: <sha>
overlay A/B: <digests and blocker count>
real-source A/B: <digests and blocker count>
SH-01..SH-09: <statuses>
real source changed files: 1 or 0
Keychain/credential/stop-write/AUTH/C0..C7 operations: 0
SH-10: awaiting_human_migration_reviewer
```

## M. 人工 Migration reviewer（不由 Luna 填）

人工 reviewer 需查看：

- 两个 real-source full shadow aggregate report。
- 每个 slice 的 run/report/verification。
- 表计数、integrity/FK、API DTO/restart、secret scan、backup/restore 证据。
- source 恢复 pre/post manifest 和单文件 digest。
- release appCommit/effective schema/plan identity。

只有真实人工 reviewer 判断无残留风险后，才能另行生成 SH-10 结论。该结论仍不等于 AUTH-C1；C0 以及 AUTH-C1 需要后续独立授权。
