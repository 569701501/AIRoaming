---
doc_id: AIR-TASK-20260711-DOC-READINESS-FINDINGS
status: complete
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、G0–G5 文档与项目事实源
---

# G0–G5 开发文档完备性复核发现

## 已确认事实

- G0 有测试骨架方案和行为矩阵；G1 有 DB-only 主方案、44 模型 Schema/旧数据映射和迁移验收；G2–G4 各有主方案、精确契约字典和验收清单；G5 有主方案、LayoutDocument/命令契约、确定性渲染契约和 200 项唯一验收标识。
- 用户逐阶段用“继续”进入后一份文档，和 G4 的既有记录采用同一确认口径；本轮用户再次澄清确认意图，因此 G0–G5 正式文档均为 `accepted`。确认仍不等同于功能完成。
- G1 的 Prisma/SQLite、SecretStore、异常恢复探针和 G5 的画布/富文本/renderer 原型属于实施期 E0 硬门禁；文档已经定义失败处理，不能在没有运行证据时提前锁定具体实现。
- G5 的可独立交付终点是 current `layout_publication`：页漫 PNG 页面并可附 PDF，条漫 PNG 切片并可条件附长图。素材 ZIP 属于 G6，不应阻塞当前 G0–G5 波次。
- 七阶段导航仍应保留素材包；“后置 G6”不等于删除现有第七步或改回六阶段。

## 发现的问题

1. 复核时发现 G5 主方案和若干上位文档曾把 G6/G7 设为当前开发前置；现已统一改为 G0–G5 当前波次、G6/G7 后置。
2. 七阶段完整验收只定义到 ZIP/`exported` 的长期终态，缺少 G0–G5 到 `layout_done`/current publication 的阶段性闭环。
3. `路线图与里程碑.md` 仍以旧的一镜一页、复制 PNG、目录包作为 M3 已完成证据，和 2026-07-11 的真实成熟度判断冲突。
4. G0 规划任务记录仍为 `in_progress`；G0–G3 历史复杂规划任务缺独立 `handoff.md`，留痕形式不一致。
5. proposed 文档未经用户整体确认不能自动冻结；这是开发授权前剩余的人工决策，不应伪装为静态检查可解决的问题。

## 初步结论

- 内容完备性：G0–G5 已达到可实施级，未发现需要新增 G6 文档才能解释的 G0–G5 核心契约。
- 冻结状态：G0–G5 均已冻结为 accepted；尚未授权开发。
- 功能状态：全部仍按现有代码事实判断，不能因文档完整而宣称已实现。

## 问题处理结果

- G6/G7 前置冲突：已修复；当前波次和阶段验收只到 G5。
- 长期七阶段口径：已保留；第七步、未来 G6 输入边界和 ZIP 总验收未删除。
- 执行路线图过期：已修复；旧 M3 勾选项明确降为历史骨架。
- 阶段性验收缺失：已修复；`layout_done`/current publication 有独立通过条件。
- 规划留痕不齐：已补 G0–G3 Handoff，六个规划目录现均有交接。
- G5 验收数量记录错误：实际 200 个唯一 ID，旧记录计数多 1，现已更正。
- G0/G1/G5 批准状态记录错误：用户已经逐阶段确认，原 `proposed` 是留痕遗漏；现已更正为 `accepted`，不改变功能未实现和需单独开发授权的事实。

## R5 九项事实源冲突复核

用户列出的 9 项全部属实，处理结论如下：

1. `生成任务协议.md` 的 `shot_generate` 示例落后于 ADR-0007；已改为顶层 `shotType/cameraAngle`、英文枚举、`durationMs` 和 `voiceLines[]`。
2. `核心用户流程.md` 角色层级漏 `minor`；已补为五层，并同步发现的字段索引与定稿规则旧表述。
3. 同一用户流程中的 `/story` 是旧路由；已统一 `/script` 与 `/script/:chapterId`，并删除不存在的 `/projects/new` 正式路由表述。
4. 候选图唯一新写路径是章节级 `chapters/{chapterSlug}/candidates/{shotId}/{candidateId}.{ext}`；当前实现写 WebP。核心数据模型、素材路径表、目录树、候选版本、manifest 示例及相关任务记录已统一。
5. ConversationThread 的 scope 漏 `image_preflight`；当前有效 scope 还包含非 workflow 的 `project_characters`，已一起明确。
6. 角色视觉唯一新写路径是 `visual-vNNN/preview.webp|final-reference.webp`；未版本化 PNG 路径从正式路径表移除。另发现并修正场景图实际章节级 WebP 路径。
7. Asset 示例统一为 G1 已接受字段集和 `storageKey`；当前 `WorkbenchAsset.path/meta` 只作为迁移前兼容投影。
8. 核心数据模型 Chapter/Conversation/Settings/DB 章节编号已改为 5.1、16.x、17、18。
9. 模块总览编号已顺排到 4.14，并同步 AI 上下文的 §4.14 交叉引用。

### 新发现但未改代码

- `apps/server/src/dialogue/dialogue-prompt.util.ts` 的 cameraAngle 列表写 `over_the_shoulder`，Shared 类型与 normalize 唯一合法值是 `over_shoulder`。normalize 会把错误值降级成 `eye_level`，属于真实生成语义损失。
- 本轮用户要求的是文档完备性复核，未授权代码开发，因此只在生成任务协议、字段索引和本记录登记。开始开发后应先加回归测试，再修 Prompt 常量。
- 剩余项：只剩单独开发授权；文档确认不能被误当作开始修改代码、Schema 或数据的授权。

## R6 六项协议、现状、术语与模板缺口

最终代码与文档证据确认六项均成立：

1. Shared `GENERATION_TASK_TYPES` 有 10 项且场景参考图已由 `CharacterReferenceService` 创建真实任务；任务协议总表只列 9 项，也没有场景任务独立输入/输出/验收契约。
2. Shared `GENERATION_TASK_TARGET_TYPES` 是 8 项；任务协议正文只列 6 项，漏 `character/scene`。
3. `全流程与字段清单.md` 同时混合旧样例、2026-07-08 mock 状态、2026-07-09 已落地代码和 G3–G6 目标，不能继续只改几行状态；需要按“当前 runtime / 已实现历史骨架 / accepted 未实现目标 / 当前 workspace 证据”重建。
4. `final_reference` 不是三个文件或纯三方向图，而是一张包含“正面半身 + 正面全身 + 侧面全身 + 背面全身”的四要素组合图；正式文档统一称“角色定稿组合图”，必要时展开四要素。
5. G1 正式领域实体名是 `Character`；当前文件态共享 DTO 仍叫 `ProjectCharacter`，字段 `projectCharacterId` 是兼容字段名。文档必须明确“字段名不等于实体名”，指向 `Character.id`。
6. `90_模板` 现有 5 份模板，缺少 ADR 与验收清单模板；同时深思熟虑模板仍引用已删除的旧工作流契约路径，应在本轮模板治理中修正。

关联代码风险：`queueSceneReference` 当前只用 `projectId + sceneId` 查找运行中任务，没有比较章节；因为 `scene_01` 等 ID 只在章节内稳定，跨章节可能错误复用另一章任务。本轮不改代码，开始开发后需用两章同 `sceneId` 的回归用例保护修复。

处理结果：

- 任务协议、全流程索引、核心模型、ADR-0004/0005/0006、写作规范、README 和复核报告均已同步。
- `90_模板` 从 5 份增至 7 份，新增 ADR 与验收清单模板。
- 当前 workspace 另发现 4 个“文件存在但 Candidate 记录缺失”的 orphan；G1 验收已有 AST-08 覆盖，本轮只补当前证据，不触碰真实数据。
- Runtime/User Review 不适用：无代码、页面、Schema、数据库或运行产物改动。
