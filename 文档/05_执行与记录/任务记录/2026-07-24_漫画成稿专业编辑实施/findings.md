# 发现与决策

---
doc_id: AIR-TASK-20260724-MANGA-EDITOR-FINDINGS
status: completed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 需求

- 用户确认直接实施，不需要逐阶段确认。
- 当前漫画成稿数据是测试数据，必要时允许重建。
- 最多使用三个子级并行推进。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `2026-07-23_漫画成稿专业编辑能力吸收方案.md` | 已通过合同、运行路径和第三方许可三方复核；实施顺序为 P0 → P1/P2 |
| `G5LayoutDocument与编辑命令契约字典.md` | LayoutDocument/Command/Revision 是业务事实源；私有画布 JSON 不得落盘 |
| `G5确定性渲染与出版导出契约.md` | 正式出版只读取不可变 Revision；预览和出版复用专用 RenderScene 语义 |
| `智能成稿规划与编辑保护契约.md` | V2 只增加 automation/protection，不增加可见元素类型 |
| `packages/shared/src/layout/automation.ts` | 已有 V2 codec、V2→V1 projection、dialogueBindings、protections 与 V1→V2 upgrade |
| `apps/server/prisma/migrations/0018_layout_document_v2_working_copy` | Working Copy 已 forward-only 支持 V2，V1→V2 可升级，V2→V1 禁止 |
| `apps/server/src/projects/layout-versioning.service.ts` | Revision、Preflight、Source Replacement 当前仍解析 `LayoutDocumentV1` |
| `prototypes/layout-editor-e0/package.json` | E0 已固定使用 `konva@10.3.0`；Web 生产包尚未声明 |

## 研究发现

- 当前工程不是“没有编辑器”，而是已有较完整领域模型和命令体系，但正式版本/出版链没有接住 V2。
- P0 需要同时修改 Shared 合同、数据库 trigger、Server 事务、worker manifest 和 Web 发布路径，单改 UI 无法交付。
- `visibleDocumentDigest` 不能替代完整 V2 digest；automation/protection 变化可能不改变像素但必须形成新的正式证据。
- P2 气泡任意配色受现有保留色对推断约束，必须双向保护，避免外观语义在重新渲染时漂移。
- P1 必须把 Transformer scale 归一化回 Shared transform；Konva node、selection、viewport、cache 和 history 均是临时态。
- V2 composition freshness 不能只比较 Working Copy 内部摘要；服务端必须追溯到已成功且已应用的 `layout_compose` 任务、其输入锁集合和输出摘要，否则正式预检应 fail closed。
- 历史 V1 出版任务可能在旧 schema 下排队、在新 migration 后完成；新 trigger 必须允许这类任务根据不可变 V1 Revision/Manifest 校验完成，且不能回填或改写历史行。
- 仓库命令必须经 `corepack pnpm` 使用 `packageManager` 固定的 pnpm 9.15.4；本机裸 `pnpm` 为 7.12.1，会误判 lockfile 并破坏依赖布局。
- Web 受控字体目录已有 400/500/700/900 四个 normal face，禁止浏览器合成 italic；旧 G5 E2E 对“只有两个字体且可点击斜体”的假设已过期，应验证四个真实 face 和斜体禁用。
- Publication warning acknowledgement 在协议层是集合语义；幂等意图比较必须同时规范化已存任务和请求的顺序，不能因同集合的排列不同返回幂等键冲突。
- Publication source policy 是正式来源身份的一部分，不能只凭碰巧一致的 `sourceDigest` 放行；V1/V2 必须分别精确绑定 `layout-publication-source-v1/v2` 和 `layout_export` consumer。
- V2 恢复必须以当前 Working Copy schema 选择恢复策略：V2 可以恢复 V1 Revision 但只能升级为 V2，禁止 V2→V1 降级；同一旧期望的恢复请求必须 replay 且不移动当前正式 Revision 指针。

## 证据

| 路径/命令 | 结论 |
| --- | --- |
| `rg --files packages/shared/src/layout apps/server/src apps/web/src` | 已定位关键 Shared/Server/Web 文件及测试 |
| `rg "LayoutDocumentV2|LayoutRevision|Preflight|Publication|Konva"` | V2 已进入 Working Copy/页面投影，但正式链路仍有 V1-only 分支 |
| `rg "\"konva\"" package.json pnpm-lock.yaml apps/*/package.json prototypes/*/package.json` | Konva 仅由 E0 原型直接依赖 |

## 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| V2 Revision 仅保存可见 V1 投影 | automation/protection 证据丢失 | 保存完整 V2，另存/冻结可见摘要 |
| trigger 仅允许 schemaVersion=1 | V2 正式版本无法写入或 seal | forward-only migration 扩展 insert/seal/immutable 约束 |
| Publication/worker 只信单摘要 | 可能渲染了错误投影或错误完整版本 | 任务输入、RenderPlan、Manifest 同时带双摘要并重算 |
| 来源替换降级到 V1 | 智能成稿保护丢失 | 对 V2 生成 Shared CommandBatch 并保持 automation |
| Konva 成为第二套状态 | Undo、保存、出版漂移 | projection/command/reprojection 单向适配 |
| 气泡保留色对冲突 | kind 与渲染轮廓不一致 | P2 禁止撞入和离开保留色对 |
| 旧 V1 任务跨 migration 完成 | 新双摘要列为空时可能被 trigger 拒绝 | 按 V1 manifest 与不可变 Revision 校验，不回填历史双摘要列 |

## 技术决策

| 决策 | 依据 |
| --- | --- |
| 新增明确的 V1/V2 联合 Revision 类型 | 保留历史 V1，同时让 V2 成为正式版本 |
| 双摘要命名固定为 `revisionDocumentDigest` 与 `visibleDocumentDigest` | 避免继续把单一 `documentDigest` 混用 |
| P0 migration 只前进、不回写历史数据 | 与 G1/G5 不可变历史和 forward-only 迁移一致 |
| Konva 使用 E0 已验证的固定版本并只进入 Web | Server 正式 renderer 不依赖交互画布 |
| P2 不新增字段 | 当前正式 Schema/Renderer 已能承载所选能力 |
| 受控字体无 italic face 时禁用斜体 | `font-synthesis:none` 与正式 renderer 必须使用同一真实字体面，不能为旧测试伪造字体 |
| warning acknowledgement 按排序后的唯一集合比较 | 用户确认语义不依赖数组顺序，保持任务幂等稳定 |

## 复核发现

### Scrutiny Review

- 完成。未发现阻止交付的 P0/P1；confirmation 集合规范化、V2 source policy、真实 restore/replay、task source rows 与 Web 默认测试接线等复核发现均已修复并回归。
- migration 对 V1 跨升级在途任务已有状态机覆盖；更细的 V2 trigger 篡改矩阵作为后续加固项，不影响现有 API、worker 重算和不可变 trigger 的通过结论。

### Runtime/User Review

- `PASS（with observations）`。隔离 DB-only 浏览器完成 V2 来源替换、Undo/Redo、warning、Revision、Publication、桌面/手机、历史恢复/replay，并验证 stale/missing/concurrent 门禁和 sealed source rows。
- 观察项仅涉及 1×1 测试素材的美术代表性、Pending render-ready 门禁精度、截图裁切和取消图片流日志噪声。

## 遇到的问题

| 问题 | 解决方案 |
| --- | --- |
| 裸 pnpm 7 离线安装误判 lockfile 并破坏依赖布局 | 使用 `corepack pnpm install` 恢复仓库固定 pnpm 9.15.4 与 Prisma Client |
| 旧 G5 字体 E2E 写死 2 个字体、尝试合成斜体且“选择”定位器变得不唯一 | 改为验证 4 个真实 normal face、斜体禁用与 exact 工具定位器，再复跑 DB E2E |
| V2 publication 幂等 helper 只排序任务 acknowledgement | 双侧排序并新增乱序同集合回归测试 |
| V2 task parser/worker 接受非规范 source policy | 按 schema 精确绑定 policy/consumer，增加摘要一致但 policy 错误仍拒绝的负向回归 |
| 沙箱内根测试无法监听 loopback/启动 Chromium/子进程 | 在授权环境执行完整 Server 回归，最终 `134 files / 777 tests` 通过 |
