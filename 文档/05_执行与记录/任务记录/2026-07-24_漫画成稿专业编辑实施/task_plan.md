# 任务计划：漫画成稿专业编辑实施

---
doc_id: AIR-TASK-20260724-MANGA-EDITOR-PLAN
status: completed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户授权、2026-07-23_漫画成稿专业编辑能力吸收方案
---

## 目标

在不引入 `LayoutDocument V3` 的前提下，把“漫画成稿”升级为可正式保存、预检、恢复来源、预览和出版 `LayoutDocumentV2` 的专业编辑链路，并以 Konva 作为纯交互适配器释放现有气泡、富文本、拟声字和图层能力。

## 强制验收标准

1. `LayoutRevision` 可不可变地保存 V1/V2，V2 保存完整 automation、dialogueBindings、dispositions 与 protections。
2. V2 Revision、Preflight、Publication 同时冻结并校验：
   - `revisionDocumentDigest`：完整 V2 文档摘要；
   - `visibleDocumentDigest`：V2 投影为 V1 后的可见文档摘要。
3. V2 专用预检覆盖对白/旁白闭合、重复或悬空引用、composition/source/lock-set freshness、保护范围合法性与可见投影稳定性；原有素材、字体、溢出、几何和 warning 门禁继续生效。
4. 来源替换对 V2 生成显式命令批，保留 automation/protections；同一 Shot 的所有出现位置原子地更新到同一 CandidateLockRevision。
5. Pending 采用前必须能展开权威视觉预览；手机只读预览正确呈现图片 contain/cover、crop/rotation/flip、边框/圆角、图层/透明度、富文本和全部气泡/尾巴。
6. 用户路径覆盖：
   `成稿预检 → warning 确认 → 保存 Revision → 出版预检 → warning 确认 → 创建出版任务 → 产物`，
   并验证无 warning、warning、error、并发摘要变化四类路径。
7. Konva 私有状态不落盘，不成为 Undo/Redo 或正式渲染事实源；一次手势只产生一个 Shared EditorCommand 或 CommandBatch。
8. UI 能直接编辑现有协议支持的气泡样式、文字方向/范围样式、SFX 语义、锁定/隐藏/图层顺序/阅读顺序；不新增 `shapePresetId`、滤镜、阴影、发光、图层名称等 V3 字段。
9. Shared、Server、Web 的定向测试、类型检查和相关 E2E 通过；Scrutiny Review 与 Runtime/User Review 均给出明确结论和证据。

## 当前阶段

阶段 9：已完成交付与留痕

## 阶段列表

### 阶段 1：事实恢复与计划冻结

- [x] 读取项目入口、写作规范、长期记忆、既有方案与 G5/V2 契约
- [x] 探索 Shared、Server、Prisma、Web 和测试现状
- [x] 明确 P0/P1/P2 边界与强制验收标准
- [x] 将三个并行 Worker 的文件边界和 Handoff 契约下发
- **状态：** complete

### 阶段 2：P0 契约与持久化硬门

- [x] 扩展 Shared Revision/Preflight/Publication/Source Replacement 为 V1/V2 联合契约
- [x] 新增 V2 双摘要、对白闭合、freshness、保护与投影一致性预检
- [x] 扩展 Prisma 模型、forward-only migration、insert/seal/immutable triggers
- [x] 扩展 Server 版本、来源替换、出版服务和 worker 的 V2 路径
- [x] 保证历史 V1 Revision/Publication 字节与解析语义不变
- **退出标准：** Shared 与 Server P0 定向测试全部通过，V2 Revision 可创建、查询、恢复、预检并出版
- **状态：** complete

### 阶段 3：P0 权威预览与真实发布路径

- [x] Pending 卡片增加可展开权威 visual preview，保留结构缩略图
- [x] 手机只读预览补齐图片、crop、边框、图层、透明度、富文本、气泡和尾巴
- [x] Web 工作流显式区分草稿预检、保存版本、出版预检、提交任务
- [x] 旧确认在 document/source/profile/issue digest 变化后失效
- **退出标准：** 四类真实发布路径和来源恢复路径均有自动化或运行证据
- **状态：** complete

### 阶段 4：P1 Konva 交互适配器

- [x] 增加 `LayoutDocument → Konva projection` 与命中/选择/变换适配层
- [x] 支持视口平移缩放、单选、多选、画格/图片/气泡尾巴交互
- [x] Transformer 的 scale 归一化到正式 width/height
- [x] 一次手势提交一个 Shared Command/Batch，pointer cancel 不产生命令
- [x] 保证 zoom/DPR 不改变最终逻辑数值，文字输入焦点与 Stage 快捷键互斥
- **退出标准：** adapter 挂载测试与关键 Playwright 交互通过，文档 round-trip 与 Undo/Redo 摘要稳定
- **状态：** complete

### 阶段 5：P2 现有协议能力显性化

- [x] 气泡面板覆盖四类 kind、尾巴、填充、描边、宽度、padding、verticalAlign、对象 opacity
- [x] 对保留色对实施“撞入/离开”双向保护
- [x] 富文本面板覆盖横排/竖排、paragraph、range style 与受控字体
- [x] SFX 通过 `text.set_semantic` 显式切换并保护几何/样式/文字
- [x] 图层面板覆盖 lock/hide/reorder 与独立阅读顺序，不伪造 rename
- **退出标准：** 每项 UI 行为都只生成已有 Shared 命令，保存/重载/撤销后语义一致
- **状态：** complete

### 阶段 6：集成验证与文档同步

- [x] 运行 Shared、Server、Web 定向测试
- [x] 运行全量类型检查、相关单元/集成/E2E
- [x] 更新产品、架构、契约、模块和验收事实源
- [x] 写 Worker Handoff 与测试证据
- **状态：** complete

### 阶段 7：Scrutiny Review

- [x] 独立检查 V1/V2 兼容、双摘要、trigger、不可变性和命令边界
- [x] 独立检查 Konva 私有状态未落盘、P2 未越过 V3
- [x] 核对命令、测试、Handoff 和未说明风险
- **状态：** complete

### 阶段 8：Runtime/User Review

- [x] 在真实页面验证编辑、预览、保存、出版与来源替换
- [x] 检查手机预览与出版产物
- [x] 保存截图/产物/关键响应证据
- **状态：** complete

### 阶段 9：交付与留痕

- [x] 修复复核发现并回归
- [x] 写功能完成记录
- [x] 更新会话记忆与长期记忆
- [x] 将目标标记完成并交付
- **状态：** complete

## Worker 分工与 Handoff 契约

| Worker | 主责 | 独占优先文件 | 必须交付 |
| --- | --- | --- | --- |
| W1 Shared Contract | V1/V2 Revision、Preflight、Publication、Source Replacement、双摘要与测试 | `packages/shared/src/layout/` | 改动清单、API/类型变化、定向测试结果、残留风险 |
| W2 Server Persistence | Prisma migration、V2 Revision/Publication/worker/source replacement | `apps/server/prisma/`、`apps/server/src/projects/layout-*` | migration/trigger 证据、服务测试、兼容说明 |
| W3 Web Editor | 权威预览、手机只读、发布路径、Konva adapter、P2 面板 | `apps/web/src/`、`apps/web/package.json`、锁文件相关 importer | UI/交互测试、截图入口、未实现边界 |

Orchestrator 负责跨层接口整合、冲突处理、全量验证和事实源更新。Worker 不修改其他 Worker 的独占优先文件；跨层需要通过 Handoff 明确字段和调用约定。

## 已做决策

| Decision | Rationale |
| --- | --- |
| P0 是发布硬门 | 先保证 V2 能成为不可变、可追溯、可出版的正式成果 |
| 保留完整摘要与可见摘要 | automation/protection 变化与最终可见像素变化都必须可追溯 |
| Konva 只做交互 adapter | Shared LayoutDocument/Command 和专用 RenderScene 继续是事实源 |
| P2 只释放已有字段 | 避免在没有 ADR、renderer/golden 支撑时偷偷引入 V3 |
| 历史 V1 原样保留 | 新能力 forward-only，不能重写既有正式版本和出版证据 |
| 测试数据允许重建 | 用户明确授权；仍优先使用临时数据库和可重复 fixture 验证 |

## 阻塞项

| Blocker | Owner | Needed Decision |
| --- | --- | --- |
| 无 | - | - |

## 遇到的错误

| Error | Attempt | Resolution |
| --- | --- | --- |
| 本机裸 `pnpm` 7.12.1 误判 lockfile | 直接执行安装 | 改用仓库固定的 `corepack pnpm` 9.15.4 并恢复依赖/Prisma Client |
| 首轮 Playwright 误用 `file` 模式 | 直接运行 spec | 改用仓库 DB-only matrix，真实执行 migration、HTTP、Prisma 与 worker |
| 沙箱内全量测试出现 `listen EPERM`、Chromium MachPort 等权限失败 | 沙箱内根测试 | 在授权环境重跑 Server 全量并以 `134 files / 777 tests` 通过 |
| 旧 M5 用例仍假设两种字体、合成 italic 和模糊“选择”定位 | 复跑旧 E2E | 更新为四个真实字体面、禁用合成斜体和精确定位，`1/1` 通过 |
| warning 确认键集合顺序导致幂等误冲突 | Scrutiny 回归 | 请求与已存任务双侧排序，补乱序同集合测试 |
| V2 task source policy 接受了过宽字面量 | Scrutiny 回归 | 按 schema 精确校验 V1/V2 policy 与 `layout_export` consumer，并补负向测试 |

## 注意事项

- 每次开始阶段前重读本计划。
- 阶段状态只在本文件维护；发现写 `findings.md`，过程和证据写 `progress.md`。
- 不触碰并行会话文件 `文档/会话/2026-07-23-23-40-成稿页面操作调整思考.md`。
- 不使用编辑器 DOM、Konva JSON、系统字体或当前 Working Copy 作为正式出版输入。
- Scrutiny Review 与 Runtime/User Review 均已完成；后续只按已记录的 P3/P4 或证据加固项另立任务。
