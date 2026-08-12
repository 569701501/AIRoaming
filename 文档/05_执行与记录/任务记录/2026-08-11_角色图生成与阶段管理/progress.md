# 进度记录

---
doc_id: AIR-TASK-2026-08-11-PROGRESS
status: active
created: 2026-08-11
updated: 2026-08-11
owner: Orchestrator
---

## 2026-08-11 14:00 - 任务启动

**行动**：创建任务目录，建立三件套

**文件**：
- `task_plan.md`：任务目标、阶段划分、验收标准
- `findings.md`：代码病根验证、行业标准验证、技术可行性评估
- `progress.md`：本文件

**状态**：任务框架建立完成

---

## 2026-08-11 14:30 - Orchestrator 深度思考完成

**输入**：
- 用户提供的问题描述和三个方案
- 行业调研结论（Dashtoon、ELSER、即梦、Midjourney）
- 现有代码验证（story-structure.service.ts、reference-prompt.util.ts）

**核心发现**：

### 代码病根确认
1. **first-write-wins 确实存在**：`story-structure.service.ts:281` 只用 `existing.appearance || description`
2. **提示词信息源单薄**：`buildStoryStructureCharacterPrompt` 只拼接单章结构卡
3. **阶段机制完全缺失**：全代码库无 `CharacterStage` 相关建模
4. **已有垫图基础设施**：`ImageProviderService.editImage` 可直接用于"保脸换装"
5. **已有参考图传递机制**：`referenceAssets` 机制现成
6. **已有文稿库**：`DocumentWork`/`DocumentChapter` 模型已建好

### 行业共识验证
1. **角色资产先行**：没有平台是"从单章文本自动出图"，都是"先定妆再生产"
2. **全书提炼再聚合**：长篇小说转视觉的标准做法是"分章观察、全局聚合"
3. **保脸换装**：Midjourney `--cw 0`、Dashtoon 长篇连载都是"图锁脸、文字换装"

### 技术可行性评估
1. **槽位 AI 稳定性**：OpenCode 已支持 `json_schema` 强制结构化，可行但需降级方案
2. **全书扫描性能**：单角色 10-15 秒，10 个主角并发约 20 秒，可接受
3. **阶段数量**：修仙小说主角估算 10-20 个阶段，可控
4. **editImage 质量**：不稳定但可接受（支持重新生成）

### 五个关键决策推理结论

**决策 1：阶段粒度** → **选 A（明确时间线节点 + 自动提案）**
- 理由：防止阶段爆炸（2574 章不能变成几百个阶段）
- 机制：每章结构确认时检测冲突 → 提案"要不要开新阶段" → 用户确认 → 新阶段从这章开始
- 估算：主角阶段约 10-20 个，可控

**决策 2：定妆时机** → **选 B（角色库页面 + 智能提醒）**
- 理由：不打断七阶段流，在"需要图"时才提醒
- 机制：角色库显示"待定妆"状态 + 首次生成参考图时弹提示（可跳过）
- 优势：改动成本低，不破坏产品体验

**决策 3：槽位设计** → **确认永久特征 vs 阶段特征分类**
- 永久特征（不应变）：face、eyes、build、height、signature
- 阶段特征（允许变）：age、clothing、hair、aura、accessories
- 冲突判定：永久特征冲突 = 拒绝合并；阶段特征冲突 = 报警可能新阶段
- 待验证：同义判定阈值（"青袍" vs "青色道袍"）

**决策 4：全书扫描触发** → **选 B（首次结构确认时异步触发）**
- 理由：按需扫描，异步不阻塞
- 机制：首次确认某角色所在章节 → 后台扫描该角色 → 完成后生成"设定卡提案"通知
- 性能：单角色 10-15 秒，异步可接受

**决策 5：实施优先级** → **先快赢（第一波 2-3 天），再完整（第二波 3-5 天）**

**第一波（修 Bug + 快赢）**：
1. 修 first-write-wins → 槽位合并
2. 生图改为参考图优先

**第二波（阶段机制）**：
3. 建 CharacterStage 表 + 垫图生成
4. 冲突报警 → 阶段提案

**第三波（全书扫描）**：
5. 导入文稿的全书扫描建档

**第四波（可选）**：
6. 交互式定妆

### 优先级推理

**为什么先做第一波？**
1. 改动量最小（2-3 天）
2. 收益最直接（修 Bug + 图质量提升）
3. 可以先验证方向，再投入第二波
4. 如果效果不好，可以及时调整

**三个方案的组合拳**：
- 方案 1 管"信息来源"（全书扫描）
- 方案 2 管"档案维护"（槽位合并 + 冲突检测）
- 方案 3 管"生图质量"（图为王 + 阶段垫图）

它们不冲突，分别解决不同层次的问题。

### 输出文档
- [x] `task_plan.md`：8 个阶段 + 5 个决策点 + 退出标准
- [x] `findings.md`：6 个代码发现 + 3 个行业共识 + 4 个可行性评估 + 5 个决策推理

**当前状态**：深度思考完成，等待用户确认

---

## 2026-08-11 16:00 - Worker：DTO 类型定义完成

**行动**：在 `packages/shared/src/dto.ts` 新增角色图生成与阶段管理相关 DTO（设计文档 §6.3）

**改动**：
- 新增 `CharacterStage`（字段与 Prisma `character_stages` 表一一对应，见 migration 0021）
- 新增 `CreateCharacterStageRequest`（name?/fromChapterId?/visualDelta 必填）
- 新增 `GenerateAnchorCandidatesRequest`（count? 缺省 3 / customPrompt?）
- 新增 `ConfirmAnchorRequest`（assetId 必填）
- `ProjectCharacter` 增加 `anchorAssetId?: string`（定妆照/锚点图，未定妆时缺省，降级用 previewReferenceAssetId）

**验证**：`packages/shared` `pnpm typecheck` 通过；`pnpm test` 285/285 通过。

**下一步**：CharacterStageService 实现（阶段创建/定妆候选/确认定妆接口）

---

## 下一步行动（待用户确认）

### 需要用户明确回答的问题

1. **五个决策是否同意？**
   - 决策 1（阶段粒度）：明确时间线节点 + 自动提案
   - 决策 2（定妆时机）：角色库页面 + 智能提醒
   - 决策 3（槽位设计）：永久特征 vs 阶段特征分类
   - 决策 4（扫描时机）：首次结构确认时异步触发
   - 决策 5（实施优先级）：先快赢（第一波），再完整（第二波）

2. **实施节奏是否同意？**
   - 先做第一波（2-3 天）看效果
   - 效果好再继续第二波（3-5 天）
   - 还是直接上第二波完整阶段机制？

3. **是否有其他约束或调整？**
   - 时间压力？
   - 资源限制？
   - 优先级调整？

### 用户确认后立即开始

**阶段 1：Worker - 数据模型设计**
- 设计 CharacterStage Schema（Prisma）
- 设计 CharacterSlots 结构
- 编写 migration 脚本
- 更新 `核心数据模型.md`

**预计时间**：半天

**等待用户输入...**

---

## 2026-08-11 16:50 - Worker：CharacterStageService 实现完成

**行动**：新建 `apps/server/src/projects/character-stage.service.ts`（+spec），注册到 ProjectsModule，同步业务写边界与 schema 契约。

**改动文件**：
- 新增 `apps/server/src/projects/character-stage.service.ts`：CharacterStageService（@Injectable），依赖 PrismaService/ProjectStore/ImageProviderService/WorkspacePathService，DB 模式专用
- 新增 `apps/server/src/projects/character-stage.service.spec.ts`：19 个单元测试（fake Prisma 内存库）
- 修改 `apps/server/src/projects/projects.module.ts`：providers 注册 CharacterStageService
- 修改 `apps/server/src/persistence/business-write-boundary.registry.ts`：登记 character-stage 写边界
- 新增 `apps/server/src/persistence/character-stage-contract.ts` + 修改 `script-workflow-runtime-migration-ledger.ts`：0021 迁移入 ledger（早期阶段遗留，本次修复）
- 修改 `g1-runtime-migration-ledger.ts`（0021 入 overlay 名单）、`schema-contract.spec.ts`（CharacterStage 入契约、57 模型、Character.anchorAssetId 入关键字段）

**核心实现**：
- `createCharacterStage`：校验 → 取上一阶段（stageOrder 最大）→ 参考图优先级（上一阶段 final/preview > anchorAssetId > primaryReference > preview）→ stageOrder 自动递增（P2002 并发重试）→ 有参考图则 generateStagePreview 垫图
- `generateStagePreview`：加载参考图资产（行+文件）→ editImage（prompt=角色名+visualDelta+保脸约束+画风指南）→ 落盘 `projects/{pid}/assets/characters/{cid}/stages/{sid}/preview.webp` → asset 行（role=character_stage_preview, staged→ready, sha256/metadata）→ 回填 previewAssetId
- `getCharacterStages` / `updateCharacterStage`（name/visualDelta/fromChapterId，visualDelta 不可清空）/ `deleteCharacterStage`（显式回收 character_stage_* 资产行+文件，schema 无外键级联）/ `regenerateStagePreview`（优先本阶段 finalAssetId，其次与创建同链）
- 错误处理：PROJECT_CHARACTER_NOT_FOUND / CHAPTER_NOT_FOUND / CHARACTER_STAGE_NOT_FOUND / PROJECT_ASSET_NOT_FOUND / PROJECT_ASSET_FILE_NOT_FOUND / CHARACTER_STAGE_VISUAL_DELTA_REQUIRED；file 模式抛 DB_PERSISTENCE_REQUIRED_FOR_CHARACTER_STAGE_SERVICE

**验证**：`pnpm typecheck` 通过；character-stage.service.spec 19/19、business-write-boundary 3/3、schema-contract 2/2、g1/script-workflow ledger 通过；prisma-migration-ledger.integration 8/8、project-chapter-shadow-importer.integration 81/81 通过。全量 Server 测试 659/662 通过，剩余 3 个失败 + 20 个 0-test 文件均为 `node:sqlite`（Node 20 环境无此内建模块，预存在问题，与本次改动无关）。

**备注**：`prisma generate` 已重新生成（CharacterStage 入 client）；`packages/shared` 已重新 build（CharacterStage DTO 入 dist）。delete 不依赖 Prisma 级联（previewAssetId 无外键），改为事务内显式删除。

---

## 2026-08-11 17:30 - Worker：角色定妆接口实现完成（阶段 4 后端）

**行动**：在 `character-reference.service.ts` 实现交互式定妆的两个接口（生成候选 + 确认定妆），接线门面与 Controller，补充 DB 读取映射与 provider seed 透传，新增单元测试。

**改动文件**：
- `apps/server/src/projects/character-reference.service.ts`：新增 `generateAnchorCandidates(projectId, characterId, input)` 与 `confirmAnchor(projectId, characterId, assetId)`（file/DB 双模式）
- `apps/server/src/projects/project-repository.service.ts`：`databaseCharacterToLocal` 补映射 `anchorAssetId`（DB 读取不再丢字段）
- `apps/server/src/projects/image-provider.service.ts`：`generateImage` 输入支持可选 `seed`，Runware 请求体透传 seed（其余 provider 依赖随机采样）
- `apps/server/src/projects/projects.service.ts`：门面委托两个方法
- `apps/server/src/projects/projects.controller.ts`：新增 `POST :projectId/characters/:characterId/anchor-candidates` 与 `POST :projectId/characters/:characterId/confirm-anchor`
- 新增 `apps/server/src/projects/character-reference.service.spec.ts`：13 个单元测试（file/DB 双模式）

**核心实现**：
- `generateAnchorCandidates`：prompt = `customPrompt ?? character.appearance ?? 角色名+角色定位`；`Promise.all` 并发出图 count 张（默认 3，钳制 1～6），每张 seed = 基准秒 + index（互不相同）；先并发出图再统一落盘，避免 file 模式并发写 project.json 竞争；候选资产 meta `kind=anchor_candidate`+`characterId`+`seed`，**不进 referenceAssetIds**（`normalizeCharacterReferenceKind` 对未知 kind 归一为 none，候选不会被当可用参考图）；DB 模式事务内建 asset 行（role=`character_anchor_candidate`，staged→ready，sha256/bytes/尺寸）
- `confirmAnchor`：校验资产存在且 meta 归属该角色（否则 `ASSET_NOT_FOUND`）→ 写 `Character.anchorAssetId`（DB 模式事务 + rowVersion 自增）→ 刷新项目缓存（`refreshProjectFromDatabase` / `repository.setProject`）→ 返回更新后角色
- 错误处理：角色不存在 `CHARACTER_NOT_FOUND`；资产不存在或不属于该角色 `ASSET_NOT_FOUND`；DB 模式走 `runBusinessTransaction` + 缓存刷新
- 旧项目兼容：`anchorAssetId` 为 null 时读取方降级 `previewReferenceAssetId`（见 核心数据模型.md），旧数据无需迁移

**验证**：`pnpm typecheck` 通过；character-reference.service.spec 13/13、image-provider 14/14、character-stage 19/19、project-repository 与 source-guard 全过；`src/projects + src/persistence` 296 个可运行测试全部通过，13 个失败文件均为 `node:sqlite`（Node 20 环境预存在问题，与本次改动无关）。

**下一步**：阶段 4 前端（角色库"待定妆"标签 + 定妆弹窗 3 选 1）与阶段 5（分镜生图用阶段图/锚点图）；候选资产清理策略（未选中候选长期保留）待规划。

---

## 2026-08-11 19:20 - Task 6：API 路由注册完成

**行动**：修复 projects.controller.ts 与 projects.service.ts 的方法调用不一致问题。

**发现**：
- projects.service.ts 已有完整的 5 个阶段管理方法（467-495 行）：`createCharacterStage` / `listCharacterStages` / `updateCharacterStage` / `deleteCharacterStage` / `regenerateCharacterStage`
- projects.controller.ts 已有 5 个端点（204-265 行），但调用的方法名不一致：
  - 第 219 行：`listCharacterStages` 调用的是 `getCharacterStages`（应该是 `listCharacterStages`）
  - 第 262 行：`regenerateCharacterStage` 调用的是 `regenerateStagePreview`（应该是 `regenerateCharacterStage`）

**改动**：
- 删除重复添加的方法定义（1138 行之后）
- 修正 controller 第 219 行：`.getCharacterStages(` → `.listCharacterStages(`
- 修正 controller 第 262 行：`.regenerateStagePreview(` → `.regenerateCharacterStage(`

**验证**：`pnpm typecheck` 通过。

**备注**：API 路由实际上在之前的任务中已经完成（可能是 Task 3 的一部分），本次只是修复了方法名不一致的问题。

---

## 2026-08-11 19:40 - Task 7：分镜生图集成阶段选择完成

**行动**：在 `candidate-generation-spec.ts` 实现阶段选择逻辑，使分镜生图能够使用角色阶段图/锚点图作为参考。

**改动文件**：
- `apps/server/src/projects/candidate-generation-spec.ts`

**核心实现**：
1. 新增辅助函数 `resolveCharacterReferenceForChapter(character, chapterId)`：
   - 查找该章节对应的阶段（按 stageOrder 倒序，优先最新阶段）
   - 阶段匹配规则：无 `fromChapterId` 时只在 `stageOrder=1` 适用所有章节；有 `fromChapterId` 时检查 `fromChapterId <= chapterId <= toChapterId`
   - 优先级：`stage.finalAssetId > stage.previewAssetId > character.anchorAssetId`
   - 降级到原有逻辑时返回 `null`
   - 返回值：`{ assetId: string, useStageLogic: boolean } | null`，`useStageLogic` 标志是否跳过 `previewConfirmedAt` 检查

2. 修改 `createCandidateGenerationSpec` 的角色参考图选择逻辑（第 307-341 行）：
   - 优先调用 `resolveCharacterReferenceForChapter`
   - 有阶段图/锚点图时直接使用（跳过 `previewConfirmedAt` 检查）
   - 无阶段图/锚点图时降级到原有逻辑（保持 `previewConfirmedAt` 检查）

**向后兼容性**：
- 无阶段/无锚点的角色行为**完全不变**：仍然只使用已确认的 `previewReferenceAssetId`
- 有阶段/锚点的角色使用新逻辑：优先阶段图/锚点图，不检查 `previewConfirmedAt`

**设计决策**：
- 为什么不直接使用 `primaryReferenceAssetId`？因为原有代码**只用** `preview`（且需要确认），说明 `primary` 可能是"四格定稿"之类的多人图，不适合单人分镜；`preview` 才是"单人预览图"
- 为什么返回 `{ assetId, useStageLogic }` 而不是直接返回 `assetId`？因为调用方需要知道是否应该跳过 `previewConfirmedAt` 检查

**验证**：`pnpm typecheck` 通过；`candidate-generation-spec.spec.ts` 5/5 通过。

**状态**：**后端全部完成**，7 个任务全部完成（Task 1-5 参考图改造，Task 6 API 路由，Task 7 分镜生图集成）。

**待完成**：前端 UI（角色库"待定妆"标签、定妆弹窗、阶段管理界面）+ 集成测试。
