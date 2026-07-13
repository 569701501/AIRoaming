---
doc_id: AIR-D2-A0-HANDOFF-001
status: ready_for_luna
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-D2 与 M6 推进路线、当前操作级 capability registry
---

# D2-A0 操作级 capability 盘点交接

## 1. 领取边界

本切片只做“公开 DB 写门禁的真实盘点”和 fail-closed 收紧，不实现任何新的业务 DB 写入。

允许修改：

- `apps/server/src/migration/db-capability-registry.ts`
- `apps/server/src/migration/db-capabilities.cli.ts`
- `apps/server/src/migration/db-capability-registry.spec.ts`
- 本任务目录内的施工、证据和复核文档

禁止在本切片修改：

- Settings/SecretStore、final importer、Outbox、Dialogue runtime、Layout/Export 的业务实现
- `db:activate --execute`、真实 workspace、真实数据库或真实系统 SecretStore
- 把 file-mode 测试或内部 repository 测试当成公开 DB API 写证据

## 2. 当前事实

- 现有聚合 registry 有 8 个 capability。
- 源码中共有 36 个 `assertDatabaseOperationSupported("...")` 调用点。
- 36 个调用点均为写门禁，因此 `readStatus` 明确写为 `not_applicable`。
- 当前只有 `generation_task_create` 有 DB 模式公开路径证据：`project-db-persistence.integration.spec.ts` 的 task guard 场景。
- 其余 35 个操作必须保持 `writeStatus=unsupported`、`evidenceTestIds=[]`，直到后续 D2 切片补齐。

## 3. 操作分组

| capability | 操作 | owner | 当前写状态 |
| --- | --- | --- | --- |
| `project_chapter_script` | `clear_project_chapters`, `clear_legacy_story`, `update_project_draft`, `clear_chapter_script`, `confirm_chapter_pending_source`, `discard_chapter_pending_source`, `import_script_to_chapters`, `ensure_chapter_exists`, `write_chapter_draft_from_ai`, `reset_project_script` | `projects/project-repository` | unsupported |
| `outline_story_storyboard_preflight` | `save_script_outline_from_ai`, `confirm_script_outline`, `confirm_story_structure`, `update_story_structure`, `confirm_image_preflight`, `resolve_image_preflight_character`, `save_pending_storyboard`, `confirm_storyboard`, `update_storyboard` | `projects/versioning` | unsupported |
| `character_scene_asset_candidate_lock` | `ensure_character_previews`, `extract_characters`, `update_character`, `generate_character_reference`, `queue_scene_reference`, `generate_scene_reference`, `queue_character_reference`, `confirm_character_preview`, `confirm_character_reference`, `delete_character_reference`, `lock_candidate`, `complete_chapter_images` | `projects/character-asset-candidate` | unsupported |
| `layout_export` | `build_layout`, `export_layout`, `export_asset_package` | `projects/layout-export` | unsupported |
| `task_create_claim_complete_cancel_recover` | `generation_task_create` | `tasks/persistent-task-repository` | implemented，有证据 |
| `project_delete_outbox` | `delete_project` | `projects/delete-outbox` | unsupported |
| `dialogue_pending_runtime` | 无当前门禁调用点 | `dialogue/runtime` | 聚合项仍 unsupported |
| `settings_credential_secret_store` | 无当前门禁调用点 | `settings/secret-store` | 聚合项仍 unsupported |

## 4. 必须交付

1. registry 暴露 `getDbCapabilityOperations()`，每行包含：`operation`、`capabilityId`、`ownerModule`、`sourceFile`、`sourceSymbol`、`readStatus`、`writeStatus`、`evidenceTestIds`。
2. `getBlockedDbCapabilities()` 同时检查聚合状态和操作级状态；任何 required capability 下有未证明写操作时继续阻断。
3. CLI JSON 同时输出 `capabilities`、`operations`、`blockedIds`。
4. 测试从真实源码提取所有门禁调用点，断言与 registry 操作集合完全相等；新增门禁但忘记登记时测试必须失败。
5. 现有聚合状态和 `--check` 的 fail-closed 行为保持不变或更严格。

## 5. 完成定义

- [ ] 源码扫描得到 36 个操作，registry 也正好 36 个且无重复。
- [ ] 每个操作有 owner、来源文件/符号、读写状态和证据数组。
- [ ] 未证明写操作没有伪造 evidence；只有 `generation_task_create` 维持 implemented。
- [ ] `db:capabilities --format json` 输出 8 个 capability、36 个 operation。
- [ ] `db:capabilities --check --format json` 退出码仍为 2，且不初始化 Prisma。
- [ ] 不触碰 D2-A1 及后续切片。

## 6. 交接给 Luna 的执行顺序

1. 先阅读本文件、`implementation_contract.md`、`test_matrix.md`、`file_map.md`、`review_checklist.md`。
2. 先运行现有 `db-capability-registry.spec.ts`，确认基线。
3. 实现 registry 和测试，运行 D2-A0 targeted test。
4. 运行 CLI、typecheck、`git diff --check`。
5. 填写 `progress.md`、`findings.md`，提交独立 commit。
6. 由另一角色按 `review_checklist.md` 复核；通过后才可领取 D2-A1。
