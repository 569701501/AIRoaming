---
doc_id: AIR-RCUT-R0B-REMEDIATION-TEST-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: developer, qa, reviewer, migration-reviewer
source: R0-B 阻塞修复实施契约
---

# R0-B 阻塞修复测试矩阵

## 1. 自动化测试

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| R0B-REF-01 | token 精确命中 sourceId | ID 优先，返回对应 targetId |
| R0B-REF-02 | token 精确命中唯一名称 | 返回唯一 targetId，matchedBy=`exact_name` |
| R0B-REF-03 | 名称不存在 | 返回 unresolved；调用 importer 转为稳定错误码 |
| R0B-REF-04 | 名称重复 | 返回 ambiguous；不能取第一个 |
| R0B-REF-05 | ID 与其他候选名称相同 | ID 优先，不产生歧义 |
| R0B-REF-06 | 多 token/重复 token | 保持原顺序和重复项，不静默去重 |
| R0B-STORY-01 | legacy beat 使用角色名 | 编码后的 beat characters 全是 structure character card id |
| R0B-STORY-02 | beat 已使用 character card id | 值保持不变，replay digest 一致 |
| R0B-STORY-03 | unknown/ambiguous beat token | 分别稳定失败；不创建 confirmed StoryVersion |
| R0B-STORY-04 | projectCharacterId 映射 | shared legacy id 确定性映射到 DB Character id |
| R0B-ORDER-01 | full shadow slice order | `story < characters < storyboard`，总数仍为 16，其他相对顺序不变 |
| R0B-BOARD-01 | legacy shot 使用唯一角色名 | document characterIds 转为正式 DB Character id |
| R0B-BOARD-02 | legacy shot 使用 shared legacy id | 同样转为正式 DB Character id |
| R0B-BOARD-03 | non-empty characterIds import | projection 下 child 数、顺序、sourceToken、characterId 与 V2 document 完全一致 |
| R0B-BOARD-04 | replay | version/shot/projection/child 行数不增加，digest 和 chapter rowVersion 不漂移 |
| R0B-BOARD-05 | target Character 未先导入 | `MIGRATION_STORYBOARD_CHARACTER_TARGET_MISSING`；不确认 StoryboardVersion |
| R0B-BOARD-06 | unknown/ambiguous token | 稳定失败，不清空 characterIds、不创建假 Character |
| R0B-BOARD-07 | 空 characterIds 旧 fixture | 既有导入仍通过，child count=0 |
| R0B-BOARD-08 | confirmed trigger contract | `PRAGMA integrity_check=ok`、foreign_key_check=0，V2 child/document 双向一致 |
| R0B-BOARD-09 | migration verify counts | report 含 StoryboardShotCharacter contextual count；source evidence 仍只要求 version/projection，verify passed 且无 count mismatch |
| R0B-FULL-01 | 完整 fixture 含 Story/Character/Storyboard 非空引用 | 16 slices succeeded、blocker=0、StoryboardShotCharacter 计数正确 |
| R0B-FULL-02 | final/backup/restore 顺序消费方 | 修改顺序后 final report、backup verify、restore verify 仍全部通过 |

建议新增纯 helper spec；集成用例继续放在现有 migration integration spec，避免复制大型数据库 fixture。

## 2. 定向命令

Luna 根据最终新增 spec 文件名同步命令；至少覆盖：

```text
pnpm --dir apps/server test -- --run \
  src/migration/legacy-character-reference.spec.ts \
  src/migration/project-chapter-shadow-importer.integration.spec.ts \
  src/backup/app-backup-restore.integration.spec.ts \
  --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000
```

若 helper spec 采用其他文件名，必须先改本文；不能留下不存在的路径。

## 3. 全量门禁

```text
pnpm --dir apps/server test -- \
  --pool=forks --poolOptions.forks.singleFork=true --testTimeout=60000 --reporter=dot
pnpm typecheck
pnpm --dir apps/server build
pnpm --dir apps/web build
pnpm --dir apps/server prisma:validate
pnpm --dir apps/server g1:manifest:check
pnpm --dir apps/server g1:schema:check
pnpm --dir apps/server g1:migration:check
pnpm --dir apps/server db:capabilities --check --format json
git diff --check
```

强制结果：

- server 全量 0 failed。
- capability `blockedIds=[]`；不能误改其他 capability。
- Prisma/G1 digest 不变。
- Git diff 不含真实 workspace 文件、DB、secret、私有 plan 或 shadow artifact。

## 4. Overlay 运行矩阵

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| R0B-OVL-01 | 恢复候选预检 | archive/member digest、size、identity、12 个 projectCharacterId 对应关系全通过 |
| R0B-OVL-02 | overlay source immutability | 原真实源 pre/post 字节和 mtime 不变 |
| R0B-OVL-03 | sealed snapshot | source/snapshot/transform/decisions digest 均合法且绑定同一 overlay |
| R0B-OVL-04 | fresh shadow A/B | 16 slices succeeded、blocker=0、规范化 reportDigest 相同 |
| R0B-OVL-05 | DB equality | 目标表集合与逐表计数摘要相同 |
| R0B-OVL-06 | Story/Storyboard 人物引用 | 43/43 beat token、65/65 shot token 完整解析；无丢失/歧义 |
| R0B-OVL-07 | DB consistency | integrity=ok、FK=0、open migration issue=0、V2 projection/child 对照通过 |
| R0B-OVL-08 | secret scan | snapshot/report/log/DB/settings/task/artifact/export sentinel=0 |

任一项失败，真实源恢复状态必须保持 `not_run`。

## 5. 真实源恢复矩阵

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| R0B-REC-01 | target absent | `lstat` 为 ENOENT；symlink/目录/文件都拒绝 |
| R0B-REC-02 | concurrent target creation | no-clobber 发布返回冲突，现有目标字节不变 |
| R0B-REC-03 | digest/identity drift | 零真实源写入并停止 |
| R0B-REC-04 | successful publish | 只新增一个目标；digest/size/identity 精确；其他源差异=0 |
| R0B-REC-05 | crash/temp cleanup | 不留下明文副本或半成品目标；临时文件可安全清理 |

## 6. Release root 矩阵

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| R0B-REL-01 | detached worktree | HEAD 等于 remediation commit、clean、位于 source workspace/当前仓库外 |
| R0B-REL-02 | locked dependencies | 离线 frozen install 成功，lockfile 零变化 |
| R0B-REL-03 | release freeze | typecheck/build/Prisma/G1/capability 全绿 |
| R0B-REL-04 | schema identity | effective schema digest 与预期一致 |
| R0B-REL-05 | cutover plan root check | 不再出现 `CUTOVER_PLAN_ROOT_OVERLAP`，所有 required roots 符合 disjoint 契约 |

## 7. SH-01～SH-10

| Gate | 必须证据 | 本任务目标 |
| --- | --- | --- |
| SH-01 | 同一 real-source sealed snapshot 的两个 fresh import | `passed_release_shadow` |
| SH-02 | 两个规范化 reportDigest 与逐表计数摘要相同 | `passed_release_shadow` |
| SH-03 | 16 slices succeeded、unresolved blocker=0 | `passed_release_shadow` |
| SH-04 | integrity/FK/schema/source evidence 全绿 | `passed_release_shadow` |
| SH-05 | API DTO 与 legacy normalized 对照通过 | `passed_release_shadow` |
| SH-06 | DB mode 重启后同一只读 DTO/digest | `passed_release_shadow` |
| SH-07 | 修改隔离的旧 metadata 副本不影响 DB DTO | `passed_release_shadow` |
| SH-08 | 全局 credential/sentinel scan=0 | `passed_release_shadow` |
| SH-09 | fresh shadow target 的 release-specific backup -> fresh roots restore rehearsal；仅隔离 credential evidence，真实 Keychain/final=0 | `passed_release_shadow` |
| SH-10 | 人工 Migration reviewer 阅读报告并签署 | `awaiting_human_migration_reviewer` |

Luna 只能准备 SH-10 review bundle，不能把 SH-10 改成 passed。

## 8. 禁止性断言

执行完成时必须报告以下计数：

```text
default user Keychain operations = 0
real credential read/write = 0
maintenance stop-write = 0
AUTH generated = 0
C0..C7 steps = 0
final importer against real target = 0
down migration = 0
real source changed files = 1 (only authorized structure.json) or 0 when blocked before recovery
```
