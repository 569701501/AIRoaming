---
doc_id: AIR-TASK-20260804-PROGRESS
status: active
created: 2026-08-04
updated: 2026-08-04
owner: AI漫游项目
audience: ai-agent
source: 文稿库实施 M1
---

# progress — 文稿库实施

## 2026-08-04（M1 数据与存储）

### 探索结论（详见 findings.md）

- 现有导入链路（ScriptRawSource*）全部项目内；文稿库是全局资产，需独立表 + 独立目录。
- Chapter 加引用列不能用 Prisma 重建表路径（SQLite DROP/重建会破坏 244 个 trigger，migrate dev 已实测报错），必须 `ALTER TABLE ADD COLUMN` 无外键普通列。
- 备份服务对 assets 有严格 digest 密封（assetInventoryDigest 参与 sealed），文稿接入备份属于独立改造。

### 已完成

1. **schema.prisma**：新增 `DocumentWork`/`DocumentChapter` 模型；`Chapter` 增加 `documentWorkId`/`documentChapterId` 普通列（无 FK）。
2. **migration `0020_document_library`**：`ALTER TABLE chapters ADD COLUMN` ×2 + CREATE TABLE ×2 + 索引。生成方式：`prisma migrate diff`（避开 migrate dev 的 trigger 问题）。
3. **真实库迁移验证**：
   - 备份 `~/.airoaming/data/db/airoaming-pre-0020-2026-08-05.sqlite`（sha256=9eaf285f…）
   - 副本上 `migrate deploy` 成功 → 真实库应用成功
   - 验证：新表存在、chapters 新列存在、**244 个 trigger 全部完好、0 失效**
4. **`document-library.repository.ts`**：DocumentWork/DocumentChapter CRUD（list/get/详情含章节/创建+章节事务/重命名/失败标记/删除），业务事务用 `runBusinessTransaction`。
5. **`document-library.store.ts`**：全局文稿文件存储（`workspace/documents/{workId}/`），saveSourceFile/readSourceText/readChapterText(按 range 投影)/deleteWorkFiles/listStorageKeys/renameWorkDir。
6. **`workspace-path.service.ts`**：ensureReady 增加 documents 目录。
7. **migration ledger 注册**：`0020_document_library` 加入 `POST_G1_OPTIONAL_OVERLAY_MIGRATION_NAMES` 与 `SCRIPT_WORKFLOW_RUNTIME_MIGRATION_NAMES`；新增 `document-library-contract.ts`（校验 SQL 含建表、禁止重建 chapters）。
8. **存量测试同步**：release-schema-identity（19→20 迁移）、schema-contract（54→56 模型 + DocumentWork/DocumentChapter）、layout-contract spec 的 slice 改为 indexOf（避免尾部迁移变化破坏切片）、project-db-persistence 的 "19→20 migrations found"。

### 验证

- `document-library.integration.spec.ts` 3/3 通过（真实 migration + 临时 workspace：创建+投影、删除+trigger 完好、storage key 列表）。
- server 全量 780/780 通过。
- **教训**：Prisma 重建表会破坏引用它的 trigger（SQLite 语义），给大表加列必须 `ALTER TABLE ADD COLUMN`；`prisma migrate deploy` 会重写 migration_lock.toml 格式（需 git checkout 恢复）；ledger 相关 spec 用 `slice(0,-N)` 依赖列表尾部，新增迁移必须改为 indexOf。

### 决策

- **M1 范围收窄**：文稿文件的备份密封接入（assets 体系）不在 M1 做，独立为「文稿备份密封改造」小任务（M6 前）；M1 只做表/存储/Repository/删除 outbox 预留。原因：备份 sealed 校验链（assetInventoryDigest → sealed value）改动面大，且当前无文稿数据，延后零风险。
- Chapter 引用列用无 FK 普通列，文档删除时应用层 SetNull（避免重建表破坏 trigger）。

## 2026-08-04（M3 后端 API — 完成）

### 已完成

1. **`document-library.service.ts`**：文稿库业务服务
   - `importSource`：编码检测 → 拆章 → 存文件 → 建 work+chapters（50MB 上限、.txt/.md 校验、空文件拒绝）
   - `list`/`getDetail`（含分组统计）/`rename`/`remove`/`readChapterText`（按 encoding 解码投影）
2. **`document-library.controller.ts`**：`/api/documents` 路由（列表/详情/上传 multipart/重命名/删除/章节文本）
   - 上传用 `FileInterceptor` 内存存储（multipart 流式解析，不受 json bodyParser 100kb 限制，limits 60MB）
3. **main.ts bodyParser**：尝试放宽被网络问题阻断（express 依赖装不上）→ **回退**，改用 multipart 上传方案（更优，上传不占 JSON body）。
4. **关键 bug 修复**：store 的 `readSourceText`/`readChapterText` 原来硬编码 `buffer.toString("utf8")`，GBK 文稿读取乱码 → 加 encoding 参数按 `TextDecoder` 解码；repository Summary 补 `sourceEncoding`。
5. **集成测试 4 个**：GBK 真实小说头上传→拆章→详情→章节文本（中文可读）、UTF-8 头、格式/空文件拒绝、删除。

### 验证

- server 全量 784/784 通过；typecheck 通过。
- **教训**：① 大文件上传用 multipart（FileInterceptor）而非 JSON body，绕开 bodyParser 100kb 限制且不引入 express 依赖；② 文件存储的读取必须按存储时检测的编码解码，不能假设 utf8。

### 待办（延后项）

- [ ] 文稿备份密封改造（独立任务）：备份 sealed 校验链（3 种 manifest + 恢复 + 密封）改动面大，延后零风险（当前无生产文稿，DB 元数据已随库备份）。
- [ ] 删除 outbox 事件（document.delete）：当前同步删除已处理项目引用置空，异步可靠性延后。
- [ ] 剧本页按需从文稿原文加载正文（章节壳 sourceText 为空）。

## 2026-08-04（M6 收尾 — 完成）

### 章节正文截断/串章修复（用户反馈）

- 问题：章节内容被截断，串到下个章节。
- 根因：**CRLF 换行偏移不一致**——拆章引擎把 `\r\n` 归一化成 `\n` 计算 offset（每行 1 字符换行），但读取端 `store.readChapterText` 直接对原始 `\r\n` 文本 slice（每行 2 字符换行）→ 偏移逐行累积错位，越靠后章节越偏，正文串到下一章。
- 修复：`readChapterText`/`readSourceText` 读取时同样 `\r\n → \n` 归一化后再 slice，与拆章 offset 完全一致。
- 验证：真实 1.txt（全 `\r\n`）详情页第一章以"走出了自己的修仙之路"正确收尾、不含第二章标题、第二章开头正确；剧本页 API 2498 字完整、编辑器滚动到底内容完整（此前 DOM 断言 false 是 CodeMirror 虚拟滚动只取视口行，非 bug）。
- 回归测试：新增 CRLF 章节投影用例（4/4 通过）；e2e 剧本页断言改为 API 投影（避免虚拟滚动影响）。

### 剧本页正文加载（用户反馈：创建项目后章节内容没显示）

- 问题：创建项目导入文稿后，章节壳 `sourceText` 为空（设计如此），但剧本页读取链路未接入「按需从文稿读正文」→ 用户看到空白章节。
- 修复（两处读取路径）：
  1. `ChapterScriptService.getChapter`：章节引用文稿且 sourceText 空时，从文稿库按 range 读取正文（只读投影）。
  2. `ProjectsService.getWorkbenchSnapshot`：workbench 快照的 currentChapter 同样按需读取（剧本页主数据源）。
  3. `ProjectRepository.databaseProjectToLocal`：LocalChapter 映射补 documentWorkId/documentChapterId（此前只有写入没有读出）。
- 验证：真实 1.txt 上传→创建项目→剧本页第一章完整显示（2426 字，无页面错误）；e2e 新增「剧本页正文断言」。
- 注：正文只读投影不落库，用户编辑后才写入 scriptWorkingText。

### 分组顺序修复（用户反馈，两轮）

**第一轮（顺序颠倒）**：原实现「先卷组、后未分章分桶」，但 1.txt 前面 695 章无卷、后面才出现卷 → 显示颠倒。修复：`displayGroups` 按章节出现顺序遍历。

**第二轮（碎片化分组）**：1.txt 是「卷章同行」格式（每章标题行含完整卷名+章号），且**原文件卷名残缺变体多**（"第十卷×1"、"第十一卷真仙降×2"、"第九卷灵界百×2"），卷内偶发漏卷前缀行 → 拆出 246 个碎片切换点。修复（拆章引擎）：
1. inlineVolume 提取**完整卷名**（"第五卷名震一方"而非"第五卷"）。
2. 卷章同行章节**更新当前卷上下文**，卷内无前缀章节归入本卷。
3. **卷名归一化**：按卷号统计出现次数，残缺变体并入主导卷名（"第十卷"→"第十卷魔界之战"）。
4. 结果：246 切换点 → **8 个干净分组**（1-695 未分章分桶 + 7 个卷组），顺序与正文一致。

新增 3 个回归测试（完整卷名、卷名归一化、卷上下文延续），拆章单测 24 个。

### 已完成

1. **删除引用处理**：`deleteWork` 删除文稿时把引用它的项目章节 `documentWorkId/documentChapterId` 置空（防悬空引用），返回 detached 数。
2. **multipart 文件名 mojibake 修复**（e2e 逼出）：multer 按 latin1 解码中文 filename 导致乱码 → latin1→utf8 重解修正。
3. **e2e `document-library.spec.ts`**（db 模式）：上传→拆章→阅读器切换→创建项目选文稿→3 章节壳验证→清理，加入 db 测试矩阵。
4. **完成记录**：`功能完成记录/2026-08-04_文稿库功能完成.md`。

### 验证

- e2e db 19/19（含文稿库闭环）、file 4/4；server 784/784、shared 280/280、web 契约 55/55。
- 备份密封改造与删除 outbox 明确记录为延后独立任务（progress 决策）。

## 2026-08-04（M5 创建项目导入 — 完成）

### 已完成

1. **契约**：`CreateProjectRequest` 增加 `documentWorkId?`（shared dto + CREATE_FIELDS + parse）。
2. **后端 createProject**：`documentWorkId` 存在时从文稿库读取章节，生成 N 个章节壳（sourceText 为空、不预载正文、不触发 AI），章节带 `documentWorkId/documentChapterId` 引用；无则保持原默认单章。
3. **LocalChapter** 增加 `documentWorkId?/documentChapterId?`；`chapterCreateData` 写入 DB；`createProjectInDatabase` 支持多章节（循环创建，事务内）。
4. **前端 CreateProjectModal**：新增「引用文稿（可选）」下拉（加载文稿列表、显示章数），选择后创建请求带 `documentWorkId`。

### 真实浏览器冒烟（Playwright 直连 dev）

- 上传《凡人修仙传》1.txt（GBK，2574 章）→ 创建项目选该文稿 → 进入剧本页。
- **DB 验证：2574 个章节壳全部建立**，标题从"第一章山边小村"到"第两千四百四十六章飞升仙界(大结局)"，顺序正确，**documentWorkId/documentChapterId 引用零缺失**。
- 测试项目与文稿已清理（删除走 outbox，pending 后完成）。

### 验证

- server 784/784、web 契约 55/55、web typecheck/build 通过。
- 用户真实项目（雨夜末班车）未受影响。

## 2026-08-04（M4 前端页面 — 完成）

### 已完成

1. **路由**：`/documents`（文稿库列表，AppShell 内）+ `/documents/:id`（详情，全屏独立路由，App.vue 增加 fullscreen 分支）。
2. **AppSidebar**：项目库上方新增「文稿库」入口（BookOpen 图标，/documents）。
3. **DocumentLibraryView.vue**：文稿列表（卡片：章数/未分章数/大小/重命名/删除）+ 新增文稿弹窗（上传 .txt/.md → 确定 → 自动拆分 → 跳详情）+ 重命名弹窗 + 删除确认（复用 LayoutConfirmDialog）。
4. **DocumentDetailView.vue**：左侧分组折叠章节列表（有卷按卷组，无卷按 **100 章分桶**「1-100 章」，默认展开第一组）+ 右侧只读原文（默认第 1 章，点击切换）+ 顶栏重命名。
5. **api.ts**：`listDocuments/getDocument/uploadDocument(FormData)/renameDocument/deleteDocument/getDocumentChapterText`；shared dto 新增文稿库类型。
6. **拆章引擎真实 bug 修复**（冒烟逼出）：
   - 正文行"第四卷的内容比之前三卷艰深很多…"被误判为卷标题 → 卷标题需"卷后短名(≤8字符)或标点/行尾"，长正文叙述不算卷。
   - 无卷文稿章节全归"未分章" → 前端详情页按 100 章分桶展示。
7. **回归测试**：新增 3 个 fixture（卷章同行、正文"第四卷"误判、短名卷标题），拆章单测 22 个。

### 真实浏览器冒烟（Playwright 直连 dev）

- 空态 → 上传真实《凡人修仙传》2.txt（UTF-8）→ 自动跳详情：1396 章、分组"1-100 章 / 101-200 章 …"每组 100、第一组默认展开、第一章默认显示、正文中文可读、分组折叠/章节切换/返回/重命名/删除全部通过，零页面错误。

### 验证

- shared 280/280、server 784/784、web 契约 55/55、web build 通过。
- 冒烟数据已清理（0 残留）。

## 2026-08-04（M2 拆章引擎 — 完成）

### 已完成

1. **`packages/shared/src/document-splitter.ts`**：三层规则拆章引擎（`splitDocumentTextV1`）：
   - 章节号识别：中文数字/阿拉伯/全角/前导零（第001章）、第X回/节/话、英文 Chapter
   - 卷识别：独立卷标题行 + **卷章同行**（"第八卷初入灵界第一千二百七十五章..."——真实网文格式）
   - 空行分块兜底（无标题时）、单章兜底（无结构）
   - 章节号连续性 warning、未分章组、卷组/百章桶（前端按 100 桶，引擎输出 groupLabel）
2. **`packages/shared/src/document-encoding.ts`**：编码识别（UTF-8 严格校验 → gb18030 兜底），`decodeDocumentBufferV1`。
3. **真实《凡人修仙传》验证**（用户桌面文件）：
   - 1.txt（GBK）：**2574 章全部识别、0 断裂、14 卷组**，含"第两千四百四十六章飞升仙界(大结局)"
   - 2.txt（UTF-8）：**1396 章全部识别**，末尾"第一千三百九十四章 飞羽(大结局)"
   - 两文件编码不同 → 编码识别必要性实证
4. **fixture**：`tests/fixtures/document-library/`（真实小说头片段 GBK+UTF-8）。
5. **单测 23 个**（拆章 19 + 编码 4）：章节号变体、卷、卷章同行、英文、特例、空行兜底、单章兜底、断裂 warning、确定性幂等、真实 GBK/UTF-8 头。

### 关键修复（真实文本逼出）

- 中文章节号正则最初要求标题后跟分隔符 → "第一章山边小村"（无分隔符）匹配失败，放宽为行首 `第X章` 即匹配。
- 卷章同行格式（卷和章在同一行）→ 新增 INLINE_CHAPTER_RE + inlineVolume 提取。
- 中文数字转 int 算法 bug（千+百组合错）→ 重写为层级累加，实测"两千四百四十四"=2444。
- 空行分块 spread 栈溢出（超大文本）→ 循环 push。

### 验证

- shared 全量 280/280 通过；typecheck 通过。
- 真实文本 1.txt+2.txt 合计 **3970 章**全部识别，0 断裂。
