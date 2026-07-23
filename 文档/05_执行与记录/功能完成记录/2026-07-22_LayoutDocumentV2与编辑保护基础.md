---
doc_id: AIR-DONE-20260722-LAYOUT-V2-PROTECTION
status: completed
created: 2026-07-22
updated: 2026-07-22
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 智能成稿编辑器重构 M1
---

# LayoutDocumentV2 与编辑保护基础完成记录

## 功能摘要

完成智能成稿后续阶段所需的 Shared 安全地基：V2 文档可在不改变任何可见元素的前提下持久表达成稿来源、对白绑定和字段级人工保护；用户与智能命令可以在同一 reducer 语义下协作，智能动作不能覆盖人工保护或锁定内容。

## 影响范围

- 新增 strict `LayoutDocumentV2` 和 `automation` 合同。
- 新增 V1 Working Copy 保守升级、V2 临时 V1 renderer 投影和 V1/V2-aware codec。
- 新增 V2 Command actor、字段保护、保护释放、绑定气泡 suppress/restore 和 snapshot inverse。
- 新增 M1 聚焦测试入口与正式证据。
- 未接 Server 持久化、数据库、页面或 Provider。

## 修改文件

- `packages/shared/src/layout/automation.ts`
- `packages/shared/src/layout/commands-v2.ts`
- `packages/shared/src/layout/automation.spec.ts`
- `packages/shared/src/layout/commands-v2.spec.ts`
- `packages/shared/src/layout/index.ts`
- `package.json`
- 智能成稿正式契约、任务记录、验收清单和长期记忆。

## 数据或协议变化

- 新增内存/JSON 协议 `schemaVersion=2, kind=layout_document_v2`。
- 新增 `automation.composition/dialogueBindings/protections`。
- 新增 command `actor=user|smart|system`。
- 新增 `protection.clear`、`balloon.suppress_bound`、`balloon.restore_bound`。
- 数据库 Schema、Prisma migration 和现有 V1 Revision/Publication 均无变化。

## 验证命令与结果

- `pnpm test:smart-layout:m1`：15/15 passed。
- `pnpm --filter @airoaming/shared test`：182/182 passed。
- `pnpm typecheck`：Shared/Server/Web passed。
- `pnpm test:render`：stage gate green。
- 全仓并行回归的 18 个既有 5 秒超时在两文件隔离复跑后 44/44 passed；详见 M1 evidence。

## 已知风险

- Server/Web 还不认识 V2 正式保存路径；旧代码回滚风险要到 M8 feature gate/兼容切换关闭。
- M1 只有 binding/protection 载体，尚无 M2 对白归一化和规则成稿内容。
- `user_suppressed` publication warning 与 Web 语义确认尚未接入。

## 后续建议

进入 M2：先以 M0 冻结语料实现对白账本和 NarrativeGroup，再做不依赖视觉 Provider 的规则条漫/页漫、基础裁切和自动气泡；继续禁止直接写正式 Working Copy。
