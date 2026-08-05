---
doc_id: AIR-TASK-20260804-FINDINGS
status: active
created: 2026-08-04
updated: 2026-08-04
owner: AI漫游项目
audience: ai-agent
source: M1 阶段代码探索
---

# findings — 文稿库实施

## 现状代码事实

### 数据库

- Prisma SQLite，schema 1417 行，已有 migration 到 0019（`0019_layout_revision_v2_publication`）。
- 现有导入链路表：`ScriptRawSourceVersion`（项目内原稿版本，含 sourceText 全文）、`ScriptRawSourceDocument/Block`（分块）、`ScriptImportAnalysisCandidate`（AI 拆章候选）、`ScriptChapterMap`（确认的章节映射）、`ScriptImportBatch/Item`（批量生成）。
- `Chapter` 表：项目内章节，有 title/order/slug/scriptWorkingText 等；`@@unique([projectId, order])`、`@@unique([projectId, slug])`。
- `ChapterScriptVersion`：正文版本（sourceText 存 DB），供下游剧情结构使用。
- `Asset`：项目内素材，storageKey 唯一，备份按 `db.asset.findMany` 遍历复制。
- 全局存储惯例：`workspace/` 下 projects/、settings/（app-settings.json）、recovery-backups/。

### 全局路径与备份

- `WorkspacePathService`：rootPath（默认 ../../../../workspace，可被 `AIROAMING_WORKSPACE_ROOT` 覆盖），`resolveVirtualPath` 校验越界。`ensureReady()` 只建 projects/。
- 备份 `app-backup.service.ts`：遍历所有 Asset（`storageKey`）复制到 staging/assets/；settings 单独 redact；数据库整体复制。文稿库若用独立目录，需在备份中显式纳入。
- 项目删除：`project-delete-outbox.service.ts` 统一处理 `asset.promote/delete`、`project.delete_files` 等 outbox 事件（claim/heartbeat/retry/terminal fencing）。

### 前端

- 项目库入口 `ProjectLibraryView.vue`（含删除弹窗 DeleteProjectDialog）；创建项目弹窗在项目库页。
- 左侧全局导航 `AppShell.vue`；项目工作区隐藏全局导航。
- 剧本页 `ScriptDocumentEditor.vue`（CodeMirror）；对话附件上传在 `ProjectDialoguePanel.vue`（无大小限制，`file.text()` 读取全文进 attachments）。

## 设计影响（M1）

1. **文稿库是全局资产，不属于任何项目**：不能复用 `Asset`（其 storageKey 语义是项目素材且备份/删除按项目契约）。需要独立表 + 独立目录。
2. **正文存储策略**：原文文件放全局目录 `workspace/documents/{workId}/source.txt`；章节正文按 range 从原文读取（只读投影），不复制到 Chapter。
3. **Chapter 引用**：Chapter 增加 `documentChapterId`（或等价）引用文稿章节；创建项目导入时建 Chapter 壳（title/order/slug），正文在剧本页按需从文稿章节 range 投影。
4. **备份**：文稿目录需纳入 `app-backup.service.ts`（新增 documents 收集），并 redact 检查；删除走 outbox 事件 `document.delete`。
5. **拆章结果**：拆章是确定性的，可同步完成（大文件也快）；但为对齐现有异步任务模式，M3 再定（可先用同步接口，量大再异步）。
6. **body 限制**：`main.ts` 无显式 bodyParser 配置（Nest 默认 100kb），上传大文件必须显式 `app.use(json({ limit: "20mb" }))` 或 controller 级处理；这是用户遇到 413 的根因。
7. **migration 命名**：现有惯例 `00XX_<snake_name>`，新 migration 为 `0020_document_library`。
