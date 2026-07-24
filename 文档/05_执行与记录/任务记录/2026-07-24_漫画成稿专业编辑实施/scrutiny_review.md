---
doc_id: AIR-TASK-20260724-MANGA-EDITOR-SCRUTINY
status: passed_with_observations
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、handoff.md、源码、migration、自动化测试与 runtime_user_review.md
---

# Scrutiny Review

## 结论

`PASS（with observations）`。

本轮独立静态复核未发现未关闭的 P0、P1 或 P2 问题：

| Priority | 未关闭数量 | 结论 |
| --- | ---: | --- |
| P0 | 0 | 无数据完整性或正式出版事实源阻断 |
| P1 | 0 | 无主用户闭环或 V1/V2 兼容阻断 |
| P2 | 0 | 复核期间发现的恢复、幂等确认集、来源策略与测试接线问题均已关闭 |
| P3 | 1 | migration 的 V2 Publication 负向状态机矩阵仍可加固，不阻断本轮交付 |

实现满足任务计划的核心边界：V1 历史保持兼容，V2 完整摘要与可见摘要贯穿正式链路，来源投影由 sealed 数据库行重建，Konva 只承担交互投影，P2 仅释放既有 V2 字段。结合最终运行复核，可进入交付收口。

## 复核边界与方法

- 本文只给出独立静态复核结论；真实浏览器、手机视口、出版产物和截图结论见 `runtime_user_review.md`。
- 复核对象包含当前完整工作树中的 Shared、Server、Prisma migration、Web、E2E 和正式文档，不只检查 Handoff 摘要。
- 重点追踪 `LayoutDocument → Revision → Preflight → Publication task/source rows → Worker → RenderPlan/Manifest` 的身份传递，并反向检查恢复、来源替换、Undo/Redo 和 V1 wire。
- E2E 审计确认关键路径未使用 `page.route().fulfill()` 等业务响应伪造；数据库直连只用于读取断言，业务写入仍经页面/API/Prisma/worker。

## Findings

### P3：V2 Publication migration 的显式负向状态机覆盖仍不完整

**现状**

- `0019_layout_revision_v2_publication/migration.sql` 已在 runtime insert trigger 中校验 Revision、双摘要、task/export 映射与 sealed task（约第 412～505 行），并在 ready trigger 中校验 V1/V2 Manifest、双摘要、来源/配置身份和产物集合（约第 507～626 行）。
- migration 测试已覆盖历史 V1 不回填、V2 Revision 合法/非法形状、Revision 不可变，以及迁移前在途 V1 Publication 可继续完成。
- 真实 V2 E2E 已正向穿过这些 trigger；worker 单测另有跨项目、来源投影篡改和错误 policy 的负向校验。

**残余**

目前缺少直接在 SQLite 状态机测试中逐项证明以下 V2 Publication 写入必然被 trigger 拒绝：

1. `revision_document_digest` 或 `visible_document_digest` 错绑；
2. task/export/Revision 映射错误；
3. ready Manifest 的任一双摘要不匹配；
4. sealed task source 行或其投影被篡改。

**判断**

这是纵深防御的测试覆盖缺口，不是已观察到的实现缺陷。静态 SQL、服务/worker 双重重算、sealed source 校验和真实 V2 成功路径已形成多层约束，因此定为 P3、非阻断。建议后续为上述四类各增加一个 `expect(...).toThrow()` 的 SQLite migration 用例。

## 已关闭的复核发现

| 原问题 | 修复证据 | 复核结论 |
| --- | --- | --- |
| Restore 可绕过 Working Copy/目标 Revision schema 策略 | `layout-versioning.service.ts` 的 `assertLayoutRestoreSchemaPolicy` 在事务读取并解析两端后、任何 replay/update 前执行；V2 可恢复 V2 或显式升级 V1，V1 不可恢复 V2 | CLOSED |
| V2 Publication 幂等比较把 warning 确认顺序误当身份 | `layoutPublicationIntentMatchesRequest` 同时排序任务确认键与请求确认键；反序请求单测通过 | CLOSED |
| V2 task parser 未固定来源 policy/consumer | Shared 导出 V1/V2 policy 常量；V2 parser 强制 `layout-publication-source-v2` 和 `layout_export`；worker 按 task schema 再次强制 | CLOSED |
| V2 E2E 未证明真实 `generation_task_sources` | M7 查询 `source_set_sealed_at` 与来源行，检查 `layout_revision/lock_set/candidate_lock/image_asset`，并重建 projection digest 与 task `source_digest` 比对 | CLOSED |
| V2 历史恢复只有 parser/helper 证据 | M7 先保存摘要不同的 V2 草稿，再由页面恢复不可变 Revision，核对 automation、`basedOnRevisionId`、replay 和正式 Revision 指针 | CLOSED |
| Web 合同测试未进入默认测试 | `apps/web/package.json` 新增默认 `test`，根 `package.json` 的 `test` 已包含 `@airoaming/web` | CLOSED |

## 关键契约复核

### 1. V1 wire 与历史兼容

- `LayoutRevisionDetailV1OrV2` 是未加 discriminator 的原 V1 detail 与 V2 detail 的联合，单条历史 V1 detail 不被改写。
- `listRevisions()` 只有在历史中出现 V2 时才返回 schemaVersion 2，并只在混合列表中为 V1 summary 补 `documentSchemaVersion: 1`；纯 V1 历史继续返回原 schemaVersion 1 wire。
- Publication 历史采用相同策略：纯 V1 返回旧响应，混合历史才添加文档 schema 判别。
- migration 不回填历史 V1 新摘要列；对迁移前已排队且新列为空的 V1 Publication 保留专门的完成兼容分支。

结论：V1 读取、历史列表、不可变证据和在途任务均保持 forward-only 兼容。

### 2. V2 双摘要

- Revision 创建保存完整 V2 `document_json/document_digest`，同时保存 V2→V1 投影的 `visible_document_digest`。
- V2 preflight 分别重算完整摘要与可见摘要，并把两者、来源、配置、issues 和权威 composition evidence 纳入 `preflightDigest`。
- Publication request、ExportRevision、task input、RenderPlan 和 Manifest 均携带双摘要。
- worker 从不可变 Revision JSON 独立重算双摘要，在渲染前与 task、Revision、ExportRevision 比对；恢复 staged Manifest 时再次比对。
- Shared 测试证明 automation/protection-only 变化会改变完整摘要，但不改变可见摘要。

结论：未发现摘要串位、以可见摘要冒充完整摘要或 worker 信任客户端摘要的问题。

### 3. Revision trigger、密封与不可变性

- runtime Revision insert 仅允许 schema 1/2，要求来源摘要、可见摘要与合法文档形状；V1 要求可见摘要等于完整摘要，V2 要求完整 automation 结构。
- seal trigger 逐一投影所有 panel/free image，并要求 `layout_source_bindings` 的数量、顺序和字段完全一致。
- immutable trigger 将 `document_json`、schema、双摘要、来源摘要和历史指针纳入不可变字段。
- runtime Publication insert/ready/immutable triggers 把 task、Revision、双摘要、Manifest 和 artifact 集合连接成数据库硬约束。

结论：没有发现可在正式服务路径中创建未密封 Revision、修改已密封 Revision 或把错误双摘要推进 ready 的静态漏洞。

### 4. 来源替换与 sealed task sources

- V2 来源替换先按 Shot 扩展到所有 appearance，并禁止同 Shot 混用 crop 决策。
- 结果通过一个 `layout.replace_sources` user command 包含全部 appearance，再包成单一 command batch；Shared 应用完成后同时重算完整/可见摘要。
- user command 自动添加 `source`、`crop` 等保护，且保留 composition、dialogueBindings 与既有 protections。
- Publication 服务在一个业务事务内创建 task、逐行写入来源、seal source set，再创建 ExportRevision。
- worker 不以 task JSON 自证：它从 `generation_task_sources` 重建规范 projection，校验固定 policy/consumer、scope 和 digest 后才渲染。

结论：同 Shot 替换具有原子命令语义；正式渲染来源由 sealed 数据库行而非客户端 JSON 决定。

### 5. Konva 边界

- `layout-konva-adapter.ts` 仅接受 LayoutCanvas 投影与 node snapshot，输出逻辑坐标或正式 transform；DPR 不参与文档数值，Transformer scale 在提交前归一为 width/height。
- `LayoutKonvaInteractionLayer.vue` 的 Stage、selection、viewport、handle、guide 和 gesture state 均为组件内瞬态变量。
- 未发现 Konva `toJSON`、`toDataURL`、本地持久化、独立 history 或正式 export 输入。
- 单选手势映射为一个 Shared command，多选映射为一个 batch；drag/transform/tail/crop 只在结束时提交，pointer cancel、窗口 blur 和 Escape 只回投影、不发命令。
- 真实浏览器路径已经验证 Konva 命中与选择模式拖动会写入正式 transform，而文字工具拖动不会写入。

结论：Konva 没有成为第二份文档、第二套 Undo/Redo 或正式渲染事实源。

### 6. P2 未越过 V3

- 气泡预设最终落到既有 `balloon.set_visual_style`/`balloon.set_kind`/`balloon.set_tail` 命令。
- 富文本与 SFX 使用既有 `text.replace_document`、range/paragraph style 和 `text.set_semantic`。
- lock、hide、图层顺序与阅读顺序使用既有命令；没有伪造图层 rename。
- 保留气泡色对对“撞入”和“离开”均有保护，并提供显式规范化入口。
- Shared 文档、Prisma schema 与 renderer 未新增 `shapePresetId`、滤镜、阴影、发光、图层名称或多尾巴字段；依赖中只有 `konva@10.3.0`，未引入 GPL 编辑器、Comical-JS、TUI Image Editor 或 Fabric.js 代码。

结论：本轮 P2 是既有 V2 能力显性化，没有暗中形成 LayoutDocument V3。

## 自动化与假阳性审计

| 验证 | 最终结果 | 覆盖意义 |
| --- | --- | --- |
| Shared 全量 | 37 files / 247 tests passed | V1/V2 codec、preflight、双摘要、来源替换、命令与保护 |
| Server 全量 | 134 files / 777 tests passed | migration、服务、worker、持久化和既有回归 |
| Web 默认测试 | 31 tests passed | 默认命令真实纳入所有 Web contract tests |
| V2 核心 Playwright | 1/1 passed（25.6s） | 同一路径覆盖 stale/error、并发 409、来源替换、warning、Revision、sealed sources、Publication、恢复/replay、手机只读 |
| 其他关键浏览器/合同 | 见 `runtime_user_review.md`，均通过 | V1 无 warning、字体/富文本/气泡、Pending、Konva 与正式产物 |
| `git diff --check` | passed | 当前 tracked diff 无空白错误 |

V2 核心 Playwright 不是只检查按钮文案：它断言数据库 Revision/Export 双摘要、task schema/sealedAt、来源 role、重建 source digest、Manifest、恢复后的完整 automation 和正式指针，因此不存在用 UI 假阳性替代正式持久化证据的问题。

## 残留风险与后续建议

1. 按 P3 finding 补齐 V2 Publication trigger 的 SQLite 负向状态机矩阵。
2. 当前运行素材为真实 HTTP 返回的 `1×1 PNG`；它能签收链路、渲染接线和产物可读性，不能替代复杂真实漫画素材的 crop、rotation、flip、富文本与气泡尾巴美术质量验收。
3. Konva 的拖动/命中已有真实浏览器证据；多选缩放、crop、尾巴和取消手势目前主要由可执行 adapter 测试与组件合同覆盖。后续可增加保存→刷新→恢复的逐手势 UI E2E，进一步降低浏览器事件差异风险。

以上均为非阻断加固项，不改变本次 `PASS（with observations）` 结论。
