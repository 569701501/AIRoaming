---
doc_id: AIR-TASK-20260723-COMIC-EDITOR-EVAL-FINDINGS
status: complete
created: 2026-07-23
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 发现与决策

## 需求

- 用户希望评估 Manga Editor Desu、Comical-JS、Konva.js、TUI Image Editor、React Komik 等专业漫画编辑能力是否应放入“漫画成稿”。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `文档/记忆/MEMORY.md` | 漫画成稿已经形成“自动完整成稿 → 同一编辑器手调 → 局部智能调整预览/应用/撤销”的正式闭环 |
| `ADR-0011` | 首版定位是有限正式成稿容器 + 高自由对象编排；滤镜、像素修图、节点工作流不进入 V1 |
| `ADR-0016` | 已采纳 `konva@10.3.0` 作为 Web 交互 adapter；严禁保存 Stage JSON 或截图编辑器作为正式导出 |
| `ADR-0019` | 智能成稿与人工编辑共用同一 LayoutDocument、Working Copy、命令与 renderer，不建立第二套编辑器 |
| `packages/shared/src/layout/` | 已有版本化文档、完整编辑命令、V2 自动成稿/人工保护、Pending、V1 publication 与 renderer 协议 |
| `apps/web/src/components/workbench/LayoutExportWorkspace.vue` | 当前正式漫画成稿工作台入口；生产实现为绝对定位 DOM + Pointer Event，并非 Konva |

## 研究发现

### 现有能力

- `LayoutDocument V1` 已有 Canvas、画格、自由图、文字、气泡；支持层级、阅读顺序、锁定、显隐、几何变换和非破坏图片裁切。
- 富文本已支持横排、竖排、受控字体、字号/字重/斜体/颜色/字距/行高/对齐/描边；独立文字已有 `semantic="sfx"`。
- 气泡已有 `speech/thought/shout/caption`、fill/stroke/padding/verticalAlign 和一个可调尾巴。
- Editor Command 已覆盖元素、画布、文字、气泡、图片、图层、对齐/分布、模板和来源替换；V2 用户命令会形成字段级人工保护。
- 生产 Web 已有拖动、数值几何编辑、模板、多选对齐/分布、图层、裁切、富文本、四类气泡、Undo/Redo 和自动保存。
- 正式 Server renderer 使用内部 HTML/SVG RenderScene 与固定 Chromium，不截图编辑器。

### 关键缺口

- ADR-0016 已选择 Konva adapter，但生产 Web 尚未接入；Konva 只在归档原型依赖中。
- 当前直接操控只有单对象拖动，缺少 Transformer、框选、多选整体变换、平移缩放、吸附/对齐线、裁切和尾巴控制柄。
- 自动成稿产出 V2，但正式 Preflight、LayoutRevision、历史恢复和 publication 仍只接 V1；Web 明确显示“导出（开发中）”。
- AI 对比缩略图没有完整复现真实 crop/flip/rotation/字体/气泡 path/尾巴；手机只读图片也未完整复现当前图片语义。
- 图片滤镜、blend、mask、文字 shadow/glow/neon、新气泡轮廓、多尾巴和持久 Group 不在当前 strict schema。

### 第三方核验

| 项目 | 核验结论 |
| --- | --- |
| Manga Editor Desu | GPL-3.0 完整 Web/PWA 应用而非库；只研究功能和交互，不复制代码、资产或 UI |
| Comical-JS | MIT 库，但不负责内部文字/样式 UI，使用 Paper.js、Canvas/SVG/DOM 和 `data-comical`；与统一 Konva/renderer 需先做兼容性 PoC |
| Konva | MIT、持续维护、库化成熟；适合已采纳的 Web interaction adapter，不接管领域状态和导出 |
| TUI Image Editor | MIT、Fabric 4.2.0、长期未发新版；不作为主画布依赖，最多隔离式单图工具并关闭 usage statistics |
| React Komik | MIT，但 React/Fabric 技术栈停留在早期版本；只参考组件词汇 |
| Komiko | 公开仓库只有展示性 README 且无 LICENSE；只参考产品方向 |

### 推荐边界

1. P0 先闭合 V2 Working Copy → Preflight → LayoutRevision → RenderPlan → Publication，并处理非 WYSIWYG 预览。
2. P1 按 ADR-0016 完成 Konva 交互 adapter；只提交内部 Editor Command。
3. P2 不升 Schema，开放已有气泡显式样式、横竖排富文本、SFX 和完整图层管理 UI。
4. P3 真实需要新轮廓、阴影/发光或非破坏滤镜时再建 `LayoutDocument V3`，同时升级 codec、命令、保护、数据库约束、preflight、renderer 和 golden。
5. AI 修图、背景移除和复杂 tone 从成稿发起，但生成派生 Candidate/Asset，用户确认后走来源替换，不把 provider 私有状态塞入 LayoutDocument。

## 证据

| 路径/命令 | 结论 |
| --- | --- |
| `packages/shared/src/layout/document.ts` | 当前严格可见元素和样式上限 |
| `packages/shared/src/layout/commands.ts`、`commands-v2.ts` | 命令全集、actor 与字段级保护 |
| `packages/shared/src/layout/automation.ts` | V2 只增加 composition/dialogueBindings/protections，可见内容投影为 V1 |
| `apps/web/src/components/workbench/LayoutExportWorkspace.vue` | 正式工作台现状和 V2 导出阻断 |
| `apps/web/src/composables/layout-editor-session.ts` | 会话历史、autosave、V2 预检/Revision 阻断 |
| `apps/server/src/projects/layout-versioning.service.ts` | 正式 Revision 当前只接受 V1 |
| `packages/shared/src/layout/publication.ts` | 正式 RenderPlan 当前只解析 V1 |
| `apps/server/src/projects/layout-renderer.service.ts` | 独立 HTML/SVG RenderScene 与 Chromium 渲染 |
| 官方 GitHub/npm 核验 | 第三方许可证、维护状态、依赖模型与可嵌入性 |

## 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 直接替换为第三方编辑器 | 可能形成第二套状态、撤销与导出事实源 | 先定义内部能力和协议，再判断是否需要底层适配器 |
| 复制 GPL 项目代码 | 商业分发与衍生作品义务不确定 | 仅做功能与交互研究，未经专项法务结论不复制或链接运行时代码 |
| 高级能力先于 V2 publication | 自动成稿只能暂存，不能交付不可变正式成品 | 把 V2 publication parity 设为 P0 硬前置 |
| Comical 与 Konva 并存 | 两套坐标、选择、撤销、保存和导出 | 默认不接；PoC 必须先过统一坐标、恢复、Undo 和正式导出 |
| 新效果塞进 V2 automation | 破坏 V2→V1 可见内容无损投影 | 新可见语义统一进入 V3 |
| 画布内直接接 AI 后端 | 绕过任务、来源和 Asset 追溯 | 从成稿发起 Server Task，生成派生 Candidate/Asset 后确认替换 |
| 简化预览被误当真实结果 | 高级 crop、字体、气泡、滤镜加入后偏差扩大 | 复用 RenderScene 语义或明确标识结构概览 |

## 技术决策

| 决策 | 依据 |
| --- | --- |
| Konva 作为生产 Web 交互 adapter | ADR-0016 已采纳；当前生产实现缺失的是该 adapter，不是领域/渲染内核 |
| 内部 LayoutDocument/Command/Renderer 继续作为唯一事实源 | 保证 Working Copy、人工保护、Undo、来源、Revision 和出版一致 |
| P2 先释放现有协议能力 | 可低风险获得明显用户价值，不需迁移文档 |
| 新可见效果进入 V3 | V2 明确只在 V1 可见内容上增加自动化元数据 |
| 气泡语义与外观分离 | `balloonKind` 参与对白覆盖和自动评分，不能承载 40 种视觉轮廓 |
| Manga Editor/React Komik/Komiko 不进入生产依赖 | 许可证、维护或仓库形态不符合直接集成边界 |

## 复核发现

### Scrutiny Review

- 首轮/二轮共发现并修正 V2 双摘要、V2 特有 preflight、Revision 数据库/API union、来源锁定、P2 命令/配色边界、V3 ADR/保护/迁移等阻断项。
- 最终结论：`PASS`，无残留实施阻断；方案可作为用户确认前的 proposed 基线。

### Runtime/User Review

- 结论：`PASS（planning only）`。
- 本轮未修改代码和 UI，因此不执行新的真实页面/导出物验收；当前用户路径、预览偏差与 P0/P1/P2 可执行验收已完成只读复核。

### 第三方复核

- 许可证、维护状态与采用矩阵结论：`PASS`。
- 已按建议补充 2026-07-23 时间快照、直接 LICENSE 链接、MIT notice 要求和“不持久化业务状态的 adapter”措辞。

## 遇到的问题

| 问题 | 解决方案 |
| --- | --- |
| V2 完整摘要与可见投影摘要原先未分离 | 增加 `revisionDocumentDigest` 与 `visibleDocumentDigest`，并定义 V2 RenderPlan/manifest/worker 核验 |
| V2 Revision 数据库与 API 仍为 V1-only | 增加 schemaVersion=2、trigger/source binding、V1/V2 union 与 migration 回归要求 |
| P2 任意配色可能改变气泡轮廓 | 固定保留色对双向规则，无法证明安全的任意配色后置 V3 |
| 新滤镜与现有 ADR 非目标冲突 | P3 改为候选；实施前必须新 ADR 修订边界 |
