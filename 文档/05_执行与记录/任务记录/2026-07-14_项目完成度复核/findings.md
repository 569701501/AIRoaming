---
doc_id: AIR-TASK-20260714-PROJECT-AUDIT-FINDINGS
status: completed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 发现与决策

## 需求

- 用户希望知道项目还有多少没做，并要求基于仓库事实检查。

## 估算口径与结论

完成度按“需求工作量 × 交付成熟度”估算。代码存在但未接入用户路径、只在 file mode 通过、未做真实运行或仍处未提交状态时，不按 100% 计入。

| 范围 | 已完成 | 剩余 | 解释 |
| --- | ---: | ---: | --- |
| 当前静态漫画 G0～G5 | 55%～65% | 35%～45% | G0～G3/数据库基础较强；真实切换、Web DB-only、G4、G5 是主体缺口 |
| 长期漫画 MVP，含 G6 | 50%～55% | 45%～50% | 额外包含 ZIP、下载和完整资产校验 |
| 完整产品愿景，含视频 | 40%～45% | 55%～60% | TTS、字幕、时间轴、视频渲染和 MP4 尚未正式启动 |

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `文档/00_索引/AI上下文入口.md` | 当前 P0 主线是故事到漫画排版出版；素材包 G6 后置 |
| `文档/05_执行与记录/路线图与里程碑.md` | G0～G3/D2/M6 已推进，G4/G5 尚待正式实施/验收 |
| `文档/05_执行与记录/任务记录/2026-07-13_D2至M6连续交付总目标/execution_status.md` | 当前真实切换生产入口仍为 changes requested/no-go |
| R0～R2 handoff/progress/review/matrix | R0-A 隔离代码推进较深；R0-B、R1、R2 的真实步骤仍未执行 |
| G1 验收清单 | 正式清单存在大量 `not_run`，与后续工程证据不同步 |
| G4/G5 计划和验收清单 | 方案与口径较完整，正式实现和验收尚未开始 |
| 当前工作树 | 存在未提交 R0-A 生产入口代码与文档，不能视为稳定交付基线 |

## 分阶段盘点

| 阶段 | 当前判断 | 已有能力 | 主要剩余 |
| --- | --- | --- | --- |
| G0 项目/基础工作台 | 基本完成，待生产化 | 项目库、创建、阶段导航、基础 API 与页面 | DB-only 真实路径、性能与产品级 E2E |
| G1 剧本版本化 | 工程能力较完整 | WorkingCopy/Publish/Pending、迁移和契约门禁 | 正式清单同步、真实 DB 用户路径验收 |
| G2 故事结构/分镜/预检 | 后端较完整，Web 接入不完整 | DB WorkingCopy/Publish/Pending API 已存在 | Web 仍调用 legacy 写接口；需 DB adapter 和 E2E |
| G3 参考图/候选/锁定基础 | 部分完成 | 任务、素材、Character/Scene visual、CandidateLock、complete images | 完整用户交互、真实 provider 和失败恢复验收 |
| G4 候选终稿与返修 | 未正式实施 | D2 的线性 CandidateLock 数据骨架 | preview→commit、replace/clear、favorite/reject、影响分析、stale/concurrency/replay、UI/API |
| G5 成稿编辑与出版 | 未正式实施 | LayoutWorkingCopy/Revision/ExportRevision 与基础 JSON/单页输出骨架 | 高自由编辑器、LayoutDocument、文本/气泡/字体、确定性 renderer、PNG/PDF/长图切片与重开一致性 |
| G6 素材包 | 后置/部分骨架 | 本地目录和 manifest | ZIP、下载、完整 sha/追溯闭环 |
| 视频链路 | 未开始 | 仅有少量 Shot 运动字段 | TTS、字幕、时间轴、音频、渲染和 MP4 |

## 代码与测试发现

### 1. DB-only Web 适配是当前最大的隐藏 P0 缺口

- Web 的 Script 步骤会根据 `versioningCapability.mode === "g2_db"` 切换到新 WorkingCopy/Publish/Pending API。
- Story Structure、Storyboard、Image Preflight 的 Web service/store 仍调用 `/story-structure/confirm`、`/storyboard/confirm`、`/storyboard/pending`、`/image-preflight/confirm` 等 legacy 写路由。
- 服务端 DB 模式对这些 legacy Story/Storyboard/Preflight 写方法明确抛出 `LEGACY_WRITE_ROUTE_DISABLED`，并提示改用 G2 API。
- 因此，如果按当前代码直接完成真实 DB-only 切换，页面第 2～4 步存在明确回归风险。
- `projects.controller.ts` 还定义了两个相同的 `POST :projectId/chapters/:chapterId/image-preflight/confirm`，需要合并为唯一契约。

**决定：** 把上述 Web adapter、duplicate route 清理和 DB-mode Playwright 加入真实 C7 前强制门禁。

### 2. 自动化基础不错，但默认门禁和覆盖范围仍有缺口

- 文档规定的 60 秒 single-fork 服务端命令：68 个 spec / 462 个测试全部通过。
- 根目录默认 `corepack pnpm test`：4 个慢测试在 5000ms 超时；其余 458 个通过，无断言失败。失败来自测试入口配置，不代表功能断言错误，但默认门禁仍应修复。
- typecheck、server build、web build、Prisma/G1/schema/migration/capability/diff 门禁通过。
- Web build 有 930.32 kB 单 chunk 警告，属于后续性能债务。
- Playwright 只有 4 条，且显式运行在 file mode；未覆盖 DB-only 七阶段、真实 provider、G4/G5 和出版产物。

### 3. 正式验收清单与实际工程状态不同步

- G1 清单仍保留大量 `not_run`，不能直接代表最新代码状态。
- G4/G5 清单中的大量未勾选项与路线图一致：正式功能尚未交付。
- R0/R1/R2 必须严格区分“隔离证据通过”和“真实环境执行通过”；当前后者仍未发生。

## 推荐顺序

1. 收口 R0-A 独立 Review、整理提交；修正默认 `pnpm test` 的 4 个 timeout。
2. 补齐 G2 Story/Storyboard/Preflight 的 DB-only Web adapter，清理 duplicate route，增加 DB-mode Playwright。
3. 获得新授权后执行 R0-B release shadow/SH-10，再执行 R1 C0～C7 和 R2 OBS-01～10。
4. 完成 G4 候选终稿和返修闭环。
5. 完成 G5 编辑器、确定性渲染及 1 章 3 镜真实出版验收。
6. 再做 G6 ZIP/下载；视频链路单独重新立项。

## 风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| R0-A 未提交且独立 Review 尚未批准 | 不能把生产入口计为稳定完成 | 先收口 Review 和提交 |
| DB-only Web 第 2～4 步未适配 | 真实切换后用户主链可能直接失败 | 提升为 C7 前门禁 |
| 只有 file-mode E2E | 无法发现数据库模式用户路径回归 | 增加 DB-mode Playwright |
| G4/G5 交互与渲染复杂度高 | 剩余工作量可能高于页面数量体现 | 以垂直切片和真实产物验收推进 |
| 真实 provider 和出版产物未验收 | 自动化全绿也不能证明生产可用 | 完成 1 章 3 镜真实运行验收 |

## 复核结论

### Scrutiny Review

- **结果：** `audit_complete / product_changes_required`
- 文档、代码和测试足以支持本报告的区间估算。
- 当前项目不能被判定为“接近全部完成”或“可真实发布”；真实切换与 G4/G5 仍是明显主线工作。
- 新发现的 Web DB-only 适配缺口必须进入路线和切换门禁。

### Runtime/User Review

- **结果：** `checklist_ready / real_environment_not_run`
- 本任务没有真实数据库切换、Keychain/provider 或真实生成授权，因此未执行也未伪造这些结果。
- 待验收：DB-only 七阶段完整点击、候选返修、布局保存/重开、真实 PNG/PDF/长图、重启一致性、失败恢复和观察期。
