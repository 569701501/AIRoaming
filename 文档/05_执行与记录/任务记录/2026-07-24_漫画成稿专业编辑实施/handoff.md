# 实施 Handoff

---
doc_id: AIR-TASK-20260724-MANGA-EDITOR-HANDOFF
status: completed
created: 2026-07-24
updated: 2026-07-24
owner: AI漫游项目
audience: ai-agent, developer, qa
source: task_plan.md
---

## Shared Contract

- Revision、Preflight、Publication、RenderPlan、Manifest 与 Source Replacement 均提供 V1/V2 联合合同；V1 的 wire shape 和语义保持兼容。
- V2 正式身份同时携带完整 `revisionDocumentDigest` 与可见 `visibleDocumentDigest`，automation/protection-only 变化只改变完整摘要。
- V2 preflight 增加对白闭合、suppression、composition provenance、source override、lock-set freshness、protection scope 与 V1 投影稳定性检查。
- 同 Shot 来源替换返回一个 user command batch，更新全部 appearance；RichText 全文替换同时保护 text 与 style。
- 证据：Shared 37 files/247 tests 全部通过。

## Server Persistence

- Prisma migration `0019_layout_revision_v2_publication` 为 Revision/Export 增加双摘要列，并以 forward-only trigger 支持 V1/V2 insert、seal、ready 与 immutable 状态。
- 历史 V1 Revision/Publication 不批量改写；迁移前排队且新列为空的 V1 publication 仍能基于不可变 V1 Revision/Manifest 完成。
- `LayoutVersioningService` 支持 V1/V2 创建、replay、恢复、混合历史、preflight 与来源替换；恢复策略禁止 V2 Working Copy 降级为 V1。
- composition projector 只接受 succeeded 且已 apply 的 `layout_compose` 证据，并校验 application、output 与锁集合；worker 从数据库 sealed rows 重建 source projection，重算双摘要后才渲染。
- publication task 按 schema 精确要求 `layout-publication-source-v1` 或 `layout-publication-source-v2`，且 consumer 必须是 `layout_export`；错误 policy 即使摘要碰巧一致也会 fail closed。
- publication task identity 绑定 schema、kind、双摘要和归一化 warning 确认键。
- 证据：Server typecheck、P0 聚焦测试、M4 数据库集成、原 V1 P6/G4-D 集成以及 Server 全量 `134 files / 777 tests` 通过。

## Web Editor

- Web API/session 支持 V1/V2 preflight、revision、restore、publication 与 source replacement；恢复请求按当前 Working Copy schema 选择合同。
- Pending 保留两张结构缩略图，但应用按钮在展开完整视觉预览前保持禁用；视觉预览复用正式图片、crop、transform、边框、富文本、气泡、尾巴与图层语义。
- `konva@10.3.0` 仅作为交互层：projection→gesture→Shared command/batch→reprojection；不保存 Konva JSON、selection、viewport 或 history。
- 气泡、文字/SFX 与图层面板只调用现有命令，补齐 RGBA、stroke、padding、verticalAlign、尾巴、语义和阅读顺序；未增加 V3 字段。
- 证据：Web production build、默认根测试已接入并通过 `31/31` 个 Web 合同、Pending/Konva 浏览器路径通过。

## 跨层字段

| 字段 | 语义 | 持久化/传递位置 |
| --- | --- | --- |
| `revisionDocumentDigest` | 完整规范 Revision 文档摘要；V2 包含 automation/protection | `LayoutRevision.document_digest`、V2 API/task/manifest |
| `visibleDocumentDigest` | V2→V1 可见投影摘要；V1 等于完整摘要 | 新 Revision 字段、V2 API/task/RenderPlan/manifest |
| `sourceLockSetDigest` | 当前 Revision 冻结的 Shot→CandidateLockRevision 集摘要 | Revision、Preflight、task、manifest |
| `preflightDigest` | 对目标、双摘要、来源、profile 和 issues 的确定性确认摘要 | Preflight 响应和单次 Revision/Publication 请求 |

## 集成检查

- [x] V1 API/Revision/Publication 回归
- [x] V2 Revision 创建/查询/恢复
- [x] V2 Preflight 四类路径
- [x] V2 来源替换
- [x] V2 Publication worker 与 manifest
- [x] V2 stale source、缺失来源和预检后摘要并发变化门禁
- [x] V2 历史恢复、事务 replay 与正式 Revision 指针稳定
- [x] sealed task source rows、`sourceDigest` 与 worker 重建一致
- [x] Pending 权威预览
- [x] 手机只读预览
- [x] Konva adapter / Undo/Redo
- [x] P2 气泡、富文本、SFX、图层

## 真实用户路径

```text
候选 A 已锁定并形成 V2 成稿
→ 同 Shot 来源替换为候选 B
→ 预览并一次提交全部 appearance
→ Undo / 保存 / Redo / 保存，摘要精确恢复
→ 成稿预检并确认 LAYOUT_COMPOSITION_SOURCE_OVERRIDE
→ 保存 V2 Revision（双摘要）
→ 出版预检并再次确认 warning
→ 创建 publication
→ worker 从 sealed DB 来源投影重建并生成 ready 产物
→ 桌面显示当前正式版本
→ 手机只读显示当前版本与 3 个真实产物
→ 修改 V2 草稿后从页面恢复不可变 Revision
→ 复用旧请求得到 replay，当前正式 Revision 指针不变
```

证据：

- `tests/e2e/web/layout-publication-m7.spec.ts`
- `evidence/v2来源覆盖与正式出版.png`
- `evidence/v2手机出版预览.png`
- `文档/05_执行与记录/任务记录/2026-07-22_智能成稿编辑器重构/evidence/m5-workspace/整章新排法对比.png`

## 已知边界

- 真实付费视觉模型的排版审美和直接可用率未由本任务签收，继续使用既有视觉质量验收口径。
- 滤镜、网点化、阴影、发光、新气泡轮廓、图层命名与多尾巴均属于 V3 候选，未进入本次 Schema 或 renderer。
- Vite 对现有 `AppShell` 大 chunk 继续给出非阻断 warning；本次没有把性能重构扩入范围。
- E2E 关闭请求时偶见 `ERR_STREAM_PREMATURE_CLOSE` 资产流日志，但相关请求、产物和断言成功；未观察到业务失败或数据损坏。
