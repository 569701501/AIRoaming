---
doc_id: AIR-TASK-20260722-SMART-LAYOUT-PLAN
status: active
created: 2026-07-22
updated: 2026-07-23
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0019、智能成稿与编辑器一体化开发方案
---

# 任务计划：智能成稿与编辑器重构

## 1. 目标

把现有第 6 步从“固定模板起稿 + 高自由手工编辑 + 多层保存/出版管理”升级为“零配置智能生成完整可编辑成稿 + 同一编辑器少量修正 + 局部智能优化 + 阅读预览 + 一次导出”。

## 2. 当前阶段

正式产品、架构、ADR、开发阶段和验收文档已完成；M0～M3 已完成固定语料、`LayoutDocumentV2`/人工保护、规则成稿和视觉规划内核。用户实际复核确认遮挡和竖向阅读顺序当前可接受，部分气泡外观不够自然作为已知风险保留。M4 已完成章节级持久 `layout_compose` 与安全应用，M5 已完成同一套“漫画成稿”编辑工作台和整章新排法。M6 已把真实图片附件、严格视觉分析 adapter、逐 Shot fallback/缓存、场景/页段/选区作用域、细粒度保护跳过、局部预览/应用/Undo 和“允许智能再次调整”接入同一工作台；条漫与页漫浏览器路径、全量回归均通过。本轮未调用付费外部视觉模型，具体模型审美质量仍未签收。下一阶段为 M7 的 V2 来源更新、阅读预览与正式出版。

## 3. 强制验收标准

1. 首次进入配置项为 0。
2. active Shot、正式对白和旁白自动覆盖率均为 100%。
3. 智能阶段不得静默改写台词，应用前文字溢出为 0。
4. 视觉签收中，普通样例画格/气泡/整页三项直接可用率分别至少 90%，困难样例分别至少 80%，严重可见错误为 0。
5. 人工修改字段和显式锁定对象不被智能操作覆盖。
6. 非首次智能调整必须先预览，可放弃，并作为一个批次撤销。
7. 现有 LayoutRevision、renderer、publication、历史导出与来源返修不得回归。

## 4. 阶段列表

| 阶段 | 内容 | 状态 | 退出标准 |
| --- | --- | --- | --- |
| M0 | 固定条漫/页漫语料、截图、人工评分和现状红灯 | complete | 10 组/12 变体、69 镜/59 文字项、真实 renderer 产物、评分规则与双人复核模板已冻结 |
| M1 | LayoutDocumentV2、V1/V2 往返、automation/dialogue binding/protection、Command actor | complete | 8 份 V1 fixture 可见摘要等价；strict binding/protection、50 命令单 inverse 和真实 renderer gate 全绿 |
| M2 | 对白归一化、叙事分组、规则模式初稿、自动气泡 | complete | 12 变体 69/69 镜头、59/59 对白/旁白唯一覆盖，0 改写、0 矩形 overflow；真实 PNG/PDF/切片/长图通过 |
| M3 | 视觉分析、多候选评分、稳定选择和有限修复 | complete_with_accepted_visual_risk | 自动硬门、真实渲染与用户轻量复核通过；部分气泡美观和专业节奏作为编辑器/视觉 AI 局部优化的已知问题继续跟踪 |
| M4 | 持久 `layout_compose`、来源投影、幂等、恢复和 apply | complete | 初次 V2 WC、重排 Pending 预览、重复 apply、手调冲突与 Server 重启集成链路通过 |
| M5 | 统一“漫画成稿”工作台和上下文编辑 | complete | 条漫/页漫零设置首次路径、恢复、直接编辑、整章预览/保留/应用/Undo 的真实浏览器路径通过 |
| M6 | 整章/场景/页面/段落/选区智能预览和保护闭环 | complete | 真实图片分析通道与逐 Shot fallback、局部 scope、先预览/可放弃/单批 Undo、0 保护覆盖和主动释放保护均通过 |
| M7 | 来源更新、阅读预览、问题定位和一键出版 | pending | 用户无需理解内部版本术语，真实 publication 可下载 |
| M8 | feature gate、V1 兼容、全量回归和真实用户签收 | pending | 验收清单关闭，无未解释失败/阻塞/未执行 |

## 5. 依赖顺序

```text
M0
  -> M1
  -> M2
  -> M3
  -> M4
  -> M5
  -> M6
  -> M7
  -> M8
```

- M2 可在规则模式下先于视觉 Provider 完成，但不得绕过 M1 protection。
- M4 前可以用纯 Shared fixture 验证规划器，不能直接接正式 Working Copy。
- M5 可先搭 UI 壳，但默认自动成稿入口不得在 M2/M4 通过前开启。
- M7 只编排现有 Revision/publication，不建立第二套导出服务。

## 6. 关键开发决策

| Decision | Rationale |
| --- | --- |
| 一套工作台，不拆智能向导与高级编辑器 | 自动结果和手调结果必须共用同一业务文档 |
| 首次自动应用，后续一律先预览 | 首次没有用户内容；后续必须保护人工劳动 |
| 模型只输出结构化视觉区域 | 最终几何需要可校验、可重复、可回归 |
| 规则 fallback 必须可独立完成基础成稿 | 外部视觉分析不能成为打开编辑器的单点故障 |
| LayoutDocumentV2 只增加 automation/protection | 复用全部现有可见元素和 renderer，控制迁移风险 |
| 稳定 dialogue binding 随文档持久化 | 后续重排能区分原文、人工改文和人工省略，不靠任务报告或文本猜测 |
| `layout_compose` 只写任务输出，apply 独立事务 | 来源/CAS 可二次校验，不让迟到任务覆盖 Working Copy |
| 新增窄 `LayoutCompositionApplication` 不可变凭证 | 任务成功不等于已经应用；终态任务和 legacy evidence 不可回写，必须用独立 exactly-once 凭证安全处理丢响应、重启与重复点击，详见 ADR-0020 |
| 用户可见步骤名改为“漫画成稿” | 页面目标不再是管理“排版 + 导出”两个技术动作 |

## 7. 实施停止线

- 没有固定语料和红灯基线，不进入 M1 以后阶段。
- 对白覆盖账本未通过，不在 UI 宣称自动气泡完成。
- protection 未持久化，不接局部智能修改正式文档。
- 规则 fallback 未通过，不把视觉 Provider 接成默认首次路径。
- 自动内容硬门、零静默改写、零溢出或用户轻量复核未通过，不把 feature gate 从 shadow 切到 on。
- 158 项 A/B 工具保留为可选内部质量研究，不再作为 M4 阻塞门；不能把空表写成已通过，也不能用自动化冒充真人结论。
- renderer golden 回归时停止切换，不用 DOM 截图或旧复制源图兜底。

## 8. 预计主要代码入口

### Shared

- `packages/shared/src/layout/`
- 任务枚举、API DTO、source projection contract。

### Server

- `apps/server/src/projects/layout-working-copy.service.ts`
- `apps/server/src/projects/layout-pending-command.service.ts`
- `apps/server/src/projects/projects.controller.ts`
- `apps/server/src/projects/projects.module.ts`
- persistent task policy/worker/handler registry。

### Web

- `apps/web/src/components/workbench/LayoutExportWorkspace.vue`
- `apps/web/src/composables/layout-editor-session.ts`
- `apps/web/src/services/api.ts`
- 项目步骤展示名、工作台路由和 E2E。

## 9. 文档交付物

- `文档/04_方案与决策/ADR-0019_智能成稿与人工编辑一体化.md`
- `文档/04_方案与决策/2026-07-22_智能成稿与编辑器一体化开发方案.md`
- `文档/02_架构与契约/2026-07-22_智能成稿规划与编辑保护契约.md`
- `文档/06_测试与验收/智能成稿与编辑器一体化验收清单.md`
- 本任务目录 `task_plan.md/progress.md/findings.md/handoff.md`。

## 10. 错误记录

| Error | Attempt | Resolution |
| --- | --- | --- |
| `Top-level await is currently not supported with cjs` | 首次直接运行 corpus 生成器 | 生成器改为 `void main()`，不依赖测试目录的模块模式 |
| `ERR_PACKAGE_PATH_NOT_EXPORTED: @airoaming/shared` | 首次从根目录运行生产 renderer 基线脚本 | 为 `tests/smart-layout/` 固定 ESM package boundary，生产 service 与 workspace package 按正式 ESM 出口加载 |
| M1 首次 typecheck 报测试文件未使用 import | 新增 V2 command 测试后首次检查 | 删除未使用 import，未降低 `noUnusedLocals` |
| M1 首次 binding/golden 测试 2 项失败 | 误把无 `sourceShotId` 的 thought 气泡作为 binding；误把 fixture 内历史简化 renderPlan 当成当前 renderer plan | binding 样例改为有明确 Shot 来源；golden 改为当前 V1 与 V2 临时投影逐字段等价，并额外运行真实 `pnpm test:render` |
| M2 首次条漫真实渲染报 `LAYOUT_RENDER_OUTPUT_INVALID:SLICE_STITCH_DIMENSIONS` | slice plan 对各段按物理像素取整，长图总高直接累加小数逻辑高度，边界可相差 1px | 规则规划器生成的 strip section 边界统一为整逻辑像素；未修改 Server renderer，复跑 12/12 成功 |
| M3 首轮视觉评分仅 65% 画格/59% 气泡 | 画格外留白候选被错误 clamp 回源画格，造成遮挡与密集堆叠 | 外置候选只按 canvas 边界限制，画格内候选才按 panel 限制；聚合自动预筛恢复到 80% 以上 |
| M3 首轮页漫虽高分但 31 格生成 29 页 | 评分只看对象几何，没有检查每页格数和占用率 | 增加 page rhythm/occupancy 评分并实现并排、sidecar、focus pair；31 格收敛为 19 页，仍保留 1 个长对白单页失败项 |
| M3 生产图出现 cover 白边与尾巴语义偏差 | Server 以 100% 图片盒平移，且气泡使用自有 CSS 圆角/固定三角，与 Shared/Web 规划语义不一致 | renderer 按素材实尺寸复用 cover 计算，并使用 Shared 受控气泡路径；现有 renderer 回归保持通过 |
| M4 首次尝试把应用证据附在 `GenerationTask.observedEvidenceJson` | 数据库约束明确该字段只允许 legacy import evidence，运行时任务写入非法；终态任务也不应在 apply 时改写 | 新增 ADR-0020 和不可变 `LayoutCompositionApplication`；与 WC/Pending 在同一事务写入，重复 apply 只做目标校验与 replay/冲突 |
| M5 首次整章重排得到与当前可见摘要相同的候选 | 确定性择优每次都选择同一最佳候选，用户看不到“重新排一版”的意义 | full reflow 在所有有效候选中避开当前可见摘要，再按既有质量排序选择不同且合法的新排法；initial 仍保持原确定性结果 |
| M5 无变化 Pending 应用触发数据库 no-op 保护 | 新排法与当前稿相同时仍尝试增加 WC 行版本，SQLite no-op trigger 拒绝该写入 | apply 在摘要相同处直接把 Pending 标记为已应用，不写 WC；有变化时仍按 CAS 原子更新 |
| M5 全量测试发现 Schema 公共模型清单仍为 53 | migration 0018 新增窄应用凭证模型后，冻结的 post-G1 overlay 清单未同步 | 公共契约增加 `LayoutCompositionApplication` 及关键字段校验，总模型数更新为 54；定向合同复跑通过 |

## 11. 总退出标准

- M0～M8 全部 complete。
- 验收清单最终结论为通过。
- 新增完成记录，更新产品、架构、模块、路线图和长期记忆。
- Static/Scrutiny Review 与真实 Runtime/User Review 均有证据。
