---
doc_id: AIR-TASK-20260711-G3-COMIC-FORMAT-FINDINGS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 项目文档、现有代码与共享契约只读审计
---

# G3 漫画版式入口与不可变约束发现

## 已确认事实

- `ProjectLibraryView.vue` 已通过现有项目命令面板打开 `CreateProjectModal.vue`，成功后沿用 `workbench.createProject` 并导航进入项目工作台。
- `CreateProjectModal.vue` 当前只有项目名称和固定 `type=comic`，`canSubmit` 与请求 payload 都没有 `comicFormat`。
- 共享 `COMIC_FORMATS` 仍包含 `vertical_scroll/page_horizontal/four_panel`；创建 DTO 可选，更新 DTO仍可写。
- `ProjectsService.createProject` 调用 `normalizeComicFormat`；该函数对缺失和非法值统一返回 `vertical_scroll`。
- `ProjectsService.updateProjectDraft` 会接受并写入新 `comicFormat`；Controller 的 TypeScript 类型不能在运行时阻止旧客户端发送额外字段。
- `ProjectStoryPanel.vue` 仍有旧三值可编辑下拉框，但当前没有被工作台引用；即使是死组件也会参与 typecheck，必须删除或改为只读，不能留下可重新接入的旧写入口。
- `TopBar.vue` 已接收 `projectName` 但当前未展示；项目卡和工作台头部也未展示版式标签。
- Project repository、ImagePreflightService 对旧记录同样使用静默 fallback；DB-only 后运行时不应继续走这些容错路径。
- `getCandidateRequestedSize` 将 `page_horizontal/four_panel` 映射为横幅/方幅；`LayoutExportService` 将 Project 版式直接映射到旧 `LayoutPage.format`。
- G1 已规定数据库只存 `vertical_scroll/paged_comic`，`page_horizontal` 自动迁移，`four_panel/缺失/非法` 在没有迁移决议时阻塞切换。
- G2 Preflight SourceSnapshot 包含 `comicFormat`；创建后不可变能防止版式原地修改导致整条来源链失真。

## 设计约束

- 正式运行时只接受 canonical 值；旧别名只允许出现在 maintenance importer 的输入侧。
- UI 禁用只是体验层，更新 DTO 删除字段、服务 allowlist/guard 和 SQLite trigger 缺一不可。
- `paged_comic` 只表示固定分页，不表示横屏；页面方向、尺寸和四格属于 G5 Layout/Page/ExportProfile。
- G3 不能因共享枚举重命名而机械改写旧 `LayoutPage.format` 的历史文档；应通过明确命名的临时 adapter 隔离，G5 再删除。
- 创建成功后的现有导航不能改变；G3 的垂直切片应从同一弹窗提交到同一工作台，只增加一个必填事实。

## 当前风险

- 只从更新 DTO 删除字段无法阻止运行时 JSON 额外属性，旧客户端仍可能绕过前端。
- 只靠 Prisma enum 无法让 SQLite 拒绝非法 TEXT；必须有 migration SQL CHECK。
- 只靠服务不提供更新方法无法防止未来 repository 或维护脚本误写；必须有不可变 trigger。
- 若兼容读取继续静默默认，迁移报告会丢失真实歧义，用户可能在不知情时被锁定成竖向条漫。
- 若把 `paged_comic` 继续展示成“横版页漫”，会重新混淆阅读容器和页面方向。

## web_search

- 本轮无需新增网络搜索；D1 已于 2026-07-10 使用主流创作工具和发布平台官方资料完成顶层版式调研，G3 只细化项目内实现。

## Scrutiny Review

结论：通过，无阻断项。

- 用户澄清已落实为“扩展现有弹窗”，主方案、UI 文档和验收均不再设计新入口/页面/向导。
- canonical runtime 与 legacy migration 的函数、模块、调用面和测试已分开，禁止复用含糊 normalize fallback。
- Create DTO、原始 body parser、Update forbidden-field guard、Service allowlist、SQLite CHECK/trigger 构成四层约束；同值 PATCH 也拒绝且整请求回滚。
- G1 44 模型保持不变；复用 Project 和 MigrationIssue。完成 run 不原地改决议，新 decision artifact 进入新 run 的 decisionsDigest。
- G2 SourceSnapshot 只读取不可变 canonical Project 值；旧 Preflight 来源不足时按 stale/unresolved，不伪造 current。
- 分页漫画与横屏已彻底分词；3:2 候选尺寸/旧 page_horizontal LayoutPage 明确标成 policy/versioned legacy adapter，不能进入用户 label 或最终验收。
- 四格只保留为 migration `layoutPresetIntent` 和 legacy LayoutPage 证据，正式 LayoutPreset 仍归 G5。
- 代码示例未使用 `as ComicFormat` 绕过前端空值，submit 会再次运行 predicate。
- 本地引用、围栏、frontmatter/doc_id、尾随空格和 docs-only 边界检查通过。

## Runtime/User Review

- 本轮不适用：没有修改 schema、代码、数据库、页面或真实 workspace。
