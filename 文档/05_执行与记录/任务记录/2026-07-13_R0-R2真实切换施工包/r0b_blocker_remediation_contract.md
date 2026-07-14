---
doc_id: AIR-RCUT-R0B-REMEDIATION-CONTRACT-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: developer, reviewer, migration-reviewer, ai-agent
source: R0-B blocker reproduction、Story/Storyboard V2 契约与 SQLite trigger 约束
---

# R0-B 阻塞修复实施契约

## 1. 范围

本契约只解决两个 R0-B 前置阻塞：

1. 正式 release root 与真实 source workspace 根重叠。
2. 缺失的结构源恢复后，旧 Story/Storyboard 人物引用无法被当前 importer 确定性迁移。

不修改 Prisma schema、migration tree、trigger、业务写路径、SecretStore、C0～C7 或观察期协议。

## 2. 不变量

| ID | 不变量 |
| --- | --- |
| R0B-INV-01 | 真实源恢复前必须先在临时 overlay 完成同字节候选的双 fresh shadow |
| R0B-INV-02 | 真实源只允许新增一个此前不存在的 `structure.json`，禁止覆盖、删除或改写其他文件 |
| R0B-INV-03 | source token 只能按 ID 或唯一精确名称解析；0 个或多个候选必须失败 |
| R0B-INV-04 | resolver 保持 token 原顺序和重复关系，不静默去重、不清空、不猜别名 |
| R0B-INV-05 | Story beat 的输出引用 StoryDocumentV2 内部 character card id |
| R0B-INV-06 | Storyboard V2 的输出引用正式稳定 DB Character id |
| R0B-INV-07 | `storyboard_shot_characters` 必须在 StoryboardVersion confirmed 前完整创建 |
| R0B-INV-08 | importer replay 不新增重复 version/shot/projection/character relation，冲突时 fail-closed |
| R0B-INV-09 | full shadow 的依赖顺序必须保证 Character 已导入后才导入 Storyboard |
| R0B-INV-10 | releaseRoot 固定到独立 remediation commit，位于真实 source workspace 外且保持 clean |
| R0B-INV-11 | 私有 plan/绝对路径/真实内容不进入仓库；仓库只留摘要、计数和状态 |
| R0B-INV-12 | 本任务不得生成 SH-10 签名、AUTH 或执行 C0～C7 |

## 3. 恢复候选契约

### 3.1 固定输入

| 字段 | 固定值 |
| --- | --- |
| archive | `workspace/recovery-backups/2026-07-10-150041-chapter-001-before-recovery.tar.gz` |
| archive sha256 | `336c9f470c177e32473d01a2e1bd4f8c61101d8f23eea9117bbad85eca4b6f23` |
| member | `chapters/chapter-001/structure.json` |
| member sha256 | `4eac7b63c79fa5408f19000aae1c3e4e6d56989bb562a6947f81003b076a0dd3` |
| member bytes | `22819` |
| target | `workspace/projects/3c91668b-03db-4022-a9cd-5b130205c14f/chapters/chapter-001/structure.json` |

### 3.2 身份断言

恢复前必须从 JSON 结构化读取并断言：

- candidate projectId 等于当前 project id。
- candidate chapterId/id 等于当前 `chapter.json.id = chapter_001`。
- candidate Story id 等于当前 storyboard 的 `sourceStoryVersionId = chapter_001_story_v001`。
- candidate `sourceScriptVersionId` 等于当前 `chapter.json.currentScriptVersionId = chapter_001_script_v001`。
- version=1、status=`structured`。
- 12 个 structure characters 的 `projectCharacterId` 全部存在、唯一，且逐个存在于当前 shared character legacy id 集合。

不得只按文件名恢复。

### 3.3 原子新增

真实源发布必须具备以下语义：

1. `lstat(target)` 必须为不存在；symlink、文件或目录均视为冲突。
2. 临时文件必须与 target 同目录，使用唯一名称和受限权限。
3. 写完整候选字节后 fsync 临时文件并校验 digest/size。
4. 使用 no-clobber 原子发布；推荐同目录 `link(temp, target)`，其 `EEXIST` 必须停止，不能先删除目标。
5. fsync 父目录，删除临时名，再次 fsync 父目录。
6. 发布后重新读取 target，digest/size/identity 必须完全一致。
7. 对真实 source workspace 做 pre/post manifest；允许差异集合必须精确等于新增 target 一项。

禁止普通覆盖式 `rename`、`cp -f`、`tar -x` 直接解到真实源或先删后写。

## 4. Legacy character resolver

新增一个无 I/O 的纯 helper，输入候选和 token，输出 resolved target id 或结构化失败：

```ts
type LegacyCharacterCandidate = {
  sourceId: string;
  exactName: string;
  targetId: string;
};

type LegacyCharacterResolution = {
  token: string;
  targetId: string;
  matchedBy: "id" | "exact_name";
};
```

解析规则按以下固定顺序：

1. 对 token 只做首尾空白清理；空字符串失败。
2. 若 token 与一个 `sourceId` 精确相等，ID 优先，直接返回该候选的 `targetId`。
3. 否则查找 `exactName` 精确相等的候选。
4. 恰好一个候选时返回其 `targetId`。
5. 0 个候选返回 `unresolved`；多个候选返回 `ambiguous`。

禁止：模糊匹配、大小写折叠、拼音/别名推断、数组下标猜测、取第一个候选。

## 5. Story importer 契约

对 `normalizeStoryStructureJson()` 的结果执行：

- candidates：每个 structure character 的
  `{ sourceId: character.id, exactName: character.name, targetId: character.id }`。
- 每个 beat 的 `characters` 逐项解析。
- 输出 beat characters 必须引用 StoryDocumentV2 的 `characters[].id`，不是 projectCharacterId，也不是 DB Character id。
- `projectCharacterId` 继续按 shared legacy id 计算稳定 DB Character id；候选中的 12 个 id 均不以 `character_` 开头，不能走“看起来像稳定 ID”的猜测分支。

稳定错误码：

| 情况 | 错误码 |
| --- | --- |
| structure character 缺 projectCharacterId | `MIGRATION_STORY_CHARACTER_UNRESOLVED` |
| beat token 无候选 | `MIGRATION_STORY_CHARACTER_REFERENCE_UNRESOLVED` |
| beat token 多候选 | `MIGRATION_STORY_CHARACTER_REFERENCE_AMBIGUOUS` |
| V2 编码其他失败 | `MIGRATION_STORY_DOCUMENT_INVALID` |

## 6. Full shadow 顺序契约

固定依赖片段从：

```text
story -> storyboard -> characters
```

改为：

```text
story -> characters -> storyboard
```

其他 slice 的相对顺序保持不变，总 slice 数仍为 16。所有依赖 `FULL_SHADOW_SLICE_ORDER` 的 backup/restore/final/verify 测试必须重跑，不允许只改数组不跑全量。

## 7. Storyboard importer 契约

### 7.1 解析来源

- 必须从同一 verified snapshot 读取
  `projects/<legacyProjectId>/shared/characters.json`。
- candidates：
  `sourceId = shared character.id`，
  `exactName = shared character.name`，
  `targetId = stableEntityId("Character", "workspace-v1:<project>:Character:<legacyId>")`。
- 每个 legacy shot character token 逐项解析后，写入 StoryboardDocumentV2 `characterIds`。
- 若 shared character 文件缺失但 shot token 非空，稳定失败；不能把数组改空。

### 7.2 目标存在性

在创建关系行前，事务内查询所有 resolved target Character：

- 必须全部存在。
- 必须属于当前 target project。
- 缺失时返回 `MIGRATION_STORYBOARD_CHARACTER_TARGET_MISSING`。

Full shadow 顺序保证正常链先运行 Character importer；单独运行 Storyboard importer 未满足依赖时应清楚失败。

### 7.3 关系投影

每个 shot 按 document 中的 characterIds 顺序创建 `StoryboardShotCharacter`：

- `storyboardShotProjectionId`：当前稳定 projection id。
- `order`：从 1 连续递增。
- `sourceToken`：resolved target Character id；这是 schemaVersion=2 trigger 要求。
- `characterId`：同一个 resolved target Character id。
- `id`：由 projection source/shot/order 确定性派生的稳定 id，不能使用随机 UUID。

原始旧名称通过 sealed source、source digest 和 projection payload digest 保留，不得为了保存旧名称破坏 V2 `sourceToken = characterId` 的 trigger 契约。

事务顺序必须是：

```text
pending StoryboardVersion
-> Shot
-> StoryboardShotProjection
-> StoryboardShotCharacter
-> confirmed StoryboardVersion
-> Chapter current pointer
```

replay 时逐项验证已有 relation 的 projection/order/sourceToken/characterId；任一不一致返回 `MIGRATION_PAYLOAD_CONFLICT`。

Storyboard report 的 `entityCounts` 必须增加 `StoryboardShotCharacter`。该行是由 storyboard payload 派生的关系投影，不新增独立 `ImportedEntitySource`；`migration-verify.service.ts` 应把它加入 g3-m3-a6 的 contextual count allowlist，而不是 source-evidence count binding。

### 7.4 稳定错误码

| 情况 | 错误码 |
| --- | --- |
| token 无候选或 shared 文件缺失 | `MIGRATION_STORYBOARD_CHARACTER_UNRESOLVED` |
| token 多候选 | `MIGRATION_STORYBOARD_CHARACTER_AMBIGUOUS` |
| resolved target Character 不存在/错 project | `MIGRATION_STORYBOARD_CHARACTER_TARGET_MISSING` |
| scene/beat 引用不存在 | `MIGRATION_STORYBOARD_REFERENCE_UNRESOLVED` |

## 8. Release root 契约

- 最终 release root 必须由 P2 remediation commit 创建 detached worktree。
- 路径必须在当前仓库和真实 source workspace 外；不得通过复制真实 workspace 改名绕过 overlap。
- worktree 必须 clean，appCommit 与 plan 完全一致。
- 依赖只能按 lockfile 离线恢复；不改变 lockfile、不下载新版本。
- `apps/server/prisma/schema.prisma`、migration tree 和构建产物必须来自同一 appCommit。
- effective schema manifest 必须重新计算并写入私有证据；本任务不改 schema，预期仍为既有 digest。
- release worktree 至少保留到 R1/R2 完成或 release owner 明确释放，不能在生成 SH gate 后立即删除。

## 9. 证据与安全边界

- 临时 overlay、snapshot、shadow DB、plan、绝对路径和报告原文全部放仓库外 0700 私有根。
- 仓库文档只写 digest、计数、错误码、状态和非敏感相对 source key。
- settings 继续只生成 redacted artifact；不得读取 Keychain 值。
- 全部日志、report、DB、settings、task/artifact/export fixture 执行 credential redactor + SEC-10 sentinel 扫描。
- 默认用户 Keychain、真实 credentials、maintenance API、AUTH、C0～C7 操作次数必须为 0。

## 10. 状态机

```text
documented_waiting_authorization
  -> code_tests_passed
  -> overlay_shadow_passed
  -> source_file_restored
  -> real_shadow_SH01_09_passed
  -> awaiting_human_SH10
```

任一阶段失败进入 `blocked_<stable_reason>`，不得跳到后续状态。
