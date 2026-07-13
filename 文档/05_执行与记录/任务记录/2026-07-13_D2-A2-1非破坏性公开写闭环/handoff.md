---
doc_id: AIR-D2-A2-1-HANDOFF-001
status: ready_for_luna
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-D2 与 M6 推进路线、G2 API 与幂等契约、D2-A0 操作级盘点、D2-A1-2 完成证据、当前实现
---

# D2-A2-1 非破坏性公开写闭环 Handoff

> 连续执行覆盖：若本文件由 `2026-07-13_D2至M6连续交付总目标/handoff.md` 领取，则“完成后停止”解释为“完成本阶段内部 Scrutiny/Runtime Review、独立提交并更新 execution_status 后自动进入 D2-A2-2”；不得跳过本文件验收，但不再等待用户逐步回复。单独领取本文件时仍按原停止线执行。

## 1. 给 Luna 的领取指令

你只领取 **D2-A2-1**，目标是把下面这条真实用户链路接到数据库事实源：

```text
项目元数据更新 / 按序创建章节
  -> AI 生成 ChapterScriptPending
    -> Web 读取 pending
      -> 用户采用或丢弃
        -> 采用只进入 Script Working Copy
          -> 同进程刷新、Nest 重启后结果一致
```

同时补齐项目级剧本大纲的 draft/confirm 数据库写入。完成后先做 Scrutiny Review 和临时根 Runtime Review。若由连续总 Handoff 领取，复核、提交通过后自动进入 D2-A2-2；否则停止，不得自行扩大范围。

开始编码前，按顺序完整阅读：

1. 本文件。
2. `implementation_contract.md`。
3. `test_matrix.md`。
4. `file_map.md`。
5. `review_checklist.md`。

## 2. 当前基线

- 起点提交：`3eba98d feat(settings): close d2-a1 secret store gate`。
- 当前 capability report 有 8 个聚合项；`settings_credential_secret_store` 已完成，`blockedIds` 为 6。
- `ScriptVersionRepository` 已实现 DB-only Working Copy、Publish、pending adopt/discard、history 与 CAS，但 Web 仍调用旧 draft/complete/source-pending 写路由。
- `ChapterScriptService` 的 AI pending、ensure chapter 和 outline 逻辑仍走 `LocalProject -> writeProjectFiles()`；DB 模式被操作门禁阻断。
- `ProjectRepository` 的 DB identity map 在直接使用 versioning repository 写库后不会自动刷新，存在“DB 已更新、同进程 Workbench 仍读旧缓存”的风险。
- 当前没有 runtime 代码创建 `ChapterScriptPending`；集成测试里的 pending 是测试直接插入。

## 3. 为什么 D2-A2 必须拆成两段

原路线把普通写入与 `clear/import/reset` 放在同一行，但当前 schema 有以下硬约束：

- `Chapter` 没有 retired/lifecycle 字段，且 `(projectId, order)`、`(projectId, slug)` 唯一。
- Chapter 物理删除只允许项目进入 deleting、delete outbox 已处理且无活动任务时发生。
- `milestoneStatus` 只能单调前进，不能从 `script_done` 回退到 `draft`。
- ScriptVersion 和 confirmed/archived outline 是历史证据，不能按旧文件实现直接覆盖或删除。

因此本次只做不删除历史、不回退里程碑的 A2-1。以下操作留给单独设计和授权的 A2-2：

- `clear_project_chapters`
- `clear_legacy_story`
- `clear_chapter_script` 的旧无 CAS 入口
- `import_script_to_chapters`
- `reset_project_script`

A2-2 必须先确定章节退役模型、影响预览和维护/备份语义；A2-1 不得提前新增猜测性 schema。

## 4. 本切片唯一范围

| 编号 | 必须完成 | 明确结果 |
| --- | --- | --- |
| S1 | `update_project_draft` | DB 模式只更新 `name/storyTitle/genreTags/artStyle/description`；`sourceText` 不再混入项目 metadata 写入 |
| S2 | `ensure_chapter_exists` | 按指定正整数 order 幂等建章；不创建 workspace 文件；并发不重复 |
| S3 | `write_chapter_draft_from_ai` | 创建单一 `ChapterScriptPending` 和可追溯 revision；不覆盖 Working Copy、current Script 或下游历史 |
| S4 | `save_script_outline_from_ai` / `confirm_script_outline` | 新 draft append-only、同命令可重放、确认显式绑定 expected outline ID、旧 confirmed 只转 archived |
| S5 | G2 Script Web 双模式 | `g2_db` 使用 Working Copy / Publish / Pending Suggestion 新接口，CAS 来自用户开始编辑时观察到的版本；`legacy_file` 保持旧 API |
| S6 | 旧路由 fail-closed | DB 模式旧 draft/complete/source-pending 写路由返回 `409 LEGACY_WRITE_ROUTE_DISABLED` 和 replacement；file mode 行为不变 |
| S7 | 缓存、重启与隔离 | 直接 DB 写后刷新 ProjectRepository identity map；同进程与重启一致；旧 workspace mutation 不改变 DB DTO |
| S8 | capability 诚实更新 | 只给本切片实际完成的 5 个操作绑定证据；两个聚合项仍 partial；`blockedIds` 仍为 6 |

本切片完成的 5 个操作登记项是：

```text
update_project_draft
ensure_chapter_exists
write_chapter_draft_from_ai
save_script_outline_from_ai
confirm_script_outline
```

`confirm_chapter_pending_source` 和 `discard_chapter_pending_source` 是旧入口名称。本切片只证明它们在 DB 模式被稳定拒绝且 Web 已切到新接口，不得伪称旧入口已实现 DB 写入。

## 5. 强制非目标

- 不实现 D2-A2-2 的 clear/import/reset。
- 不实现 Story/Storyboard/Preflight、Character/Scene/Asset/CandidateLock（D2-A3）。
- 不实现 Layout/Export、Dialogue DB runtime、Project delete/Outbox、final importer、D3、M6。
- 不访问真实 workspace、真实数据库、真实 provider、真实 Keychain 或真实用户凭据。
- 不修改 0001～0010 migration、G1 schema 生成器或 trigger；本切片预期 **0 schema change**。
- 不把 AI pending 直接发布成 ScriptVersion，不把 pending 文本直接写入 current Script。
- 不为通过 capability gate 删除操作登记、伪造 evidence 或把 `blockedIds` 降到 5。

## 6. 完成定义

- [ ] S1～S8 全部有对应测试 ID 和代码证据。
- [ ] AI pending 首次创建、同命令重放、不同命令冲突、采用、丢弃均有 fresh SQLite 证据。
- [ ] pending 创建和采用均不创建 ScriptVersion；只有 Publish 创建 ScriptVersion。
- [ ] Web 不再调用 DB 模式旧 draft/complete/source-pending 写路由。
- [ ] 旧路由的 HTTP code、error code 和 replacement 均稳定。
- [ ] 同进程 Workbench、Nest reopen 和直接 DB 行一致。
- [ ] 临时 workspace 中伪造/篡改旧 metadata、script pending、outline 文件后，DB DTO 字节语义不变。
- [ ] `project_chapter_script`、`outline_story_storyboard_preflight` 仍为 partial，`blockedIds` 精确为 6，其他 capability 不变。
- [ ] 定向测试、server 全量测试、workspace typecheck、Prisma/G1 门禁和 diff check 全绿。
- [ ] 更新本任务 `progress.md`、`findings.md`，新增 `scrutiny_review.md`、`runtime_review.md`，独立提交。

## 7. Luna 执行顺序

1. 跑基线测试并记录现有通过数；不要先改 capability。
2. 先实现 DB command repository 与事务单测：metadata、ensure chapter、AI pending、outline。
3. 接入 Projects/ChapterScript service，并补 identity-map refresh。
4. 切换 Web 到 G2 Script 新接口，再给旧入口加稳定拒绝。
5. 跑 fresh SQLite 的同进程、并发、重放、重启、workspace isolation 测试。
6. 最后才更新 5 个 operation evidence；运行 capability report，确认 blockedIds 仍为 6。
7. 完成静态复核和临时根运行复核，独立 commit；连续总 Handoff 模式下更新总 execution_status 并自动领取下一阶段，单独领取模式下停止。

## 8. 停止线

出现以下任一情况立即停止并写入 `findings.md`，不要自行扩大设计：

- 需要新增/改动 migration 或 trigger 才能完成 A2-1。
- 需要物理删除 Chapter、ScriptVersion、confirmed outline 或下游历史。
- 需要让 milestone 回退。
- 需要访问真实根、真实 provider 或真实系统凭据。
- 现有 G2 CAS 契约与实现无法同时满足。
- 任何方案会让 `blockedIds` 提前降到 5。
