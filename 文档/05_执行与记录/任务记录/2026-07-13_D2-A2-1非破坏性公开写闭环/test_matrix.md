---
doc_id: AIR-D2-A2-1-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-1 实施契约
---

# D2-A2-1 测试矩阵

## 1. 证据规则

- DB 证据全部使用 fresh SQLite、正式 0001～0010 migration 和测试临时根。
- 每个 test title 以本表 ID 开头，供 capability `evidenceTestIds` 稳定引用。
- 不把 file-mode 单测、内部 mock 或测试直接插行当作公开 DB 写完成证据。
- Runtime Review 不调用真实 AI provider；AI 结果使用 deterministic fixture。
- 任一测试不得读取默认 workspace、默认 data root 或真实 Keychain。

## 2. 定向矩阵

| ID | 场景 | 必须断言 |
| --- | --- | --- |
| CAPABILITY-01 | `WorkbenchSnapshot` 模式能力 | file=`legacy_file` 且 6 flag 全 false；DB=`g2_db`、除 importer 外 5 flag true；来源是真实 runtime |
| META-01 | DB metadata 首次更新 + no-op replay | 只改允许字段；rowVersion 首次 +1；相同 patch 不再增加；同进程 DTO 正确 |
| META-02 | DB patch 显式带 `sourceText` | HTTP/Service 均 `409 LEGACY_WRITE_ROUTE_DISABLED`；replacement 指向当前章 Working Copy；DB 零变化 |
| META-03 | metadata restart/isolation | reopen 后字段一致；伪旧 `project.json` 修改不影响 DB DTO；workspace project tree 未被业务写创建 |
| CHAPTER-01 | ensure 缺失 order | 创建确定性 id/slug/空 digest；Project current pointer 同事务切换；无 workspace 文件 |
| CHAPTER-02 | ensure replay + concurrency | 已存在返回同一章且不改 title；两个并发相同 order 最终一行、无 500、无重复 |
| CHAPTER-03 | ensure 非法/scope | order 非正整数稳定 400；Project 不存在 404；任何失败均零写入 |
| AI-PENDING-01 | 首次 AI suggestion | 同事务创建一条 pending + 一条 revision + last pointer；Chapter rowVersion +1；Working/current/history 不变 |
| AI-PENDING-02 | 同命令重放 | 同 pendingId/revisionId，行数和 rowVersion 不再变化，`replayed=true` |
| AI-PENDING-03 | 冲突 | 同命令不同 digest=`PENDING_VERSION_CONFLICT`；另一个 active pending=`ACTIVE_PENDING_EXISTS`；原 pending 字节不变 |
| AI-PENDING-04 | provenance | scoped Conversation 存在时 FK 正确；不存在时为 null、不是空字符串；toolCallId/operation/digest 可追溯 |
| AI-PENDING-05 | 批量 child identity | 同 root toolCall 生成多章时每章 child tool ID 唯一稳定，不撞 revision unique |
| AI-PENDING-06 | adopt | 使用已观察 pending/digest/rowVersion；pending 删除；Working Copy 变 dirty/clean；ScriptVersion 数量不变；replay 不重复 |
| AI-PENDING-07 | discard | pending 删除；Working/current/history 不变；revision 保留；重复 discard 幂等 |
| AI-PENDING-08 | downstream gate | active pending 时现有 NewWork gate 继续返回 `UPSTREAM_WORK_NOT_CONFIRMED` |
| OUTLINE-01 | 保存新 draft | 规范化 text/digest；version=previous max+1；current pointer/Project rowVersion 同事务；旧 formal 正文不变 |
| OUTLINE-02 | draft replay/conflict | 同命令同 digest 重放；同命令不同 digest 冲突；相同内容不制造重复版本 |
| OUTLINE-03 | expected ID confirm | 只确认用户看到的 ID；旧 expected 返回 `CURRENT_VERSION_CHANGED`；当前已 confirmed 重放 |
| OUTLINE-04 | formal history | 前一 confirmed 只转 archived；confirmed/archived 的 title/text/digest/version/createdAt 不变；失败整事务回滚 |
| CACHE-01 | 同进程 identity map | Working update/clear/revert/publish、pending create/adopt/discard、history copy 后 Workbench 立即反映 DB，不需重启 |
| RESTART-01 | Nest reopen | metadata、章节、pending/revision、outline、Working/current/history 重启前后语义一致 |
| LEGACY-01 | DB 旧路由拒绝 | draft/complete/source-pending confirm/delete 均 409 + 正确 replacement + DB 零写 |
| LEGACY-02 | file mode 回归 | 同四条旧路由保持现有文件行为；G2 新 mutation 仍 `G2_DB_MODE_REQUIRED` |
| WEB-01 | Web 模式分支 | file mode 调旧 API；DB mode 调新 API；切章重新加载 observed Working/pending |
| WEB-02 | Web CAS | 保存/发布/adopt 请求使用编辑开始时缓存的 expected 值；409 不自动重试并刷新提示 |
| WEB-03 | 发布顺序 | dirty editor 先 PATCH Working，再用返回的新 rowVersion/digest Publish；任一步失败不制造第二版本/下一章 |
| ISOLATION-01 | 旧 workspace mutation | 写入同 ID 的伪 project/chapter/pending/outline 文件后，同进程与 reopen 公共 DTO 均不变 |
| TX-01 | 事务失败 | outline insert 后 pointer 前、pending insert 后 revision/pointer 前任一失败，相关行与 pointer 全回滚 |
| CAP-01 | operation evidence | 仅 5 个目标 operation 为 implemented 且证据非空；其他 operation 不误改；源码与 registry 集合仍相等 |
| CAP-02 | 聚合 gate | 两个目标聚合仍 partial；`blockedIds` 精确为 6；`--check` 退出 2 |
| SCOPE-01 | 禁止项保持阻塞 | clear project/legacy story/chapter、import、reset 仍 unsupported；没有新 migration/schema/trigger |

## 3. Fresh SQLite 主链路

至少用一个公开 Service/API 集成用例按以下顺序跑完整链路，不能拆成互不相干的测试直接插行：

```text
deploy 0001～0010
  -> Nest start(db + 临时 workspace/data root)
  -> create project
  -> update metadata
  -> ensure chapter 2 + replay
  -> save outline draft + confirm expected ID
  -> create AI pending on chapter 2 + replay
  -> GET working-copy + GET pending-suggestion
  -> adopt pending
  -> PATCH working-copy（如需）
  -> publish
  -> create second pending
  -> discard
  -> same-process workbench read
  -> mutate legacy workspace fixtures
  -> same-process read unchanged
  -> app.close/reopen
  -> workbench/working/history/outline read unchanged
```

主链路结束时至少直接查询 DB 断言：

```text
projects = 1
chapters = 2
active pending = 0
AI revision >= 2
ScriptVersion 只来自 publish
current outline = expected confirmed outline
workspace/projects/{projectId} 不存在（业务写未创建）
```

## 4. 双客户端冲突用例

用同一次 GET 得到的 `chapterRowVersion` 构造 A/B 两个请求：

1. A 更新 Working Copy 成功。
2. B 使用旧 rowVersion 更新，必须 `409 CHAPTER_VERSION_CONFLICT`。
3. B 不得由服务端或 Web 自动读取最新 rowVersion 后重试。
4. 最终正文只能是 A 的内容。

对 outline confirm 同样验证：用户看到 outline A 后，后台产生 outline B；确认 A 必须 `409 CURRENT_VERSION_CHANGED`，不能确认 B。

## 5. capability 预期快照

A2-1 完成后只允许以下变化：

| operation | 期望 |
| --- | --- |
| `update_project_draft` | implemented + META/ISOLATION/RESTART evidence |
| `ensure_chapter_exists` | implemented + CHAPTER/RESTART evidence |
| `write_chapter_draft_from_ai` | implemented + AI-PENDING/RESTART evidence |
| `save_script_outline_from_ai` | implemented + OUTLINE/RESTART evidence |
| `confirm_script_outline` | implemented + OUTLINE/RESTART evidence |

聚合快照：

```text
project_chapter_script              = partial
outline_story_storyboard_preflight  = partial
blockedIds.length                   = 6
db:capabilities --check exit        = 2
```

## 6. 建议命令

```text
pnpm --filter @airoaming/shared test
pnpm --filter @airoaming/server exec vitest run \
  src/projects/project-script-command.repository.spec.ts \
  src/projects/project-db-persistence.integration.spec.ts \
  src/projects/projects.service.source-guard.spec.ts \
  src/migration/db-capability-registry.spec.ts

pnpm --filter @airoaming/server test -- --testTimeout=20000
pnpm -w typecheck
pnpm --filter @airoaming/web build
pnpm --filter @airoaming/server prisma:validate
pnpm --filter @airoaming/server g1:manifest:check
pnpm --filter @airoaming/server g1:schema:check
pnpm --filter @airoaming/server g1:migration:check
pnpm --filter @airoaming/server db:capabilities -- --format json
pnpm --filter @airoaming/server db:capabilities -- --check --format json
git diff --check
```

说明：

- `db:capabilities --check` 预期退出码是 2，命令编排要显式捕获并核对 JSON，不能把预期 fail-closed 当测试失败或误写成退出 0。
- 最终证据记录实际文件数、测试数和耗时，不复制旧阶段数字。
