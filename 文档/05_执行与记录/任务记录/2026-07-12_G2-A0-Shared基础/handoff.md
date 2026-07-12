---
doc_id: AIR-TASK-G2-A0-HANDOFF-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2-A0 Shared 实现
---

# Handoff

## 已交付

- `packages/shared/src/versioning/canonical-json.ts`：JCS 风格 canonical JSON、重复键检测 parser、平台无关 SHA-256。
- `packages/shared/src/versioning/document-codec.ts`：Script V1、Story/Storyboard/Preflight V2 strict codec 与 digest。
- `packages/shared/src/versioning/source-snapshot.ts`：通用和 Preflight SourceSnapshot builder、排序、摘要。
- `packages/shared/src/versioning/stable-shot-id.ts`：Stable Shot ID 派生。
- `packages/shared/src/versioning/production-state.ts`：ChapterProductionState/Freshness 纯函数及 reason codes。
- `packages/shared/src/versioning/*.spec.ts` 与 `testdata/canonical-jcs.json`：golden、负例和 truth table。

## 进入下一切片的前置

1. G2-A1 复用本模块，不再复制 hash/codec/reason code 定义。
2. A1/B 将 Prisma rows 映射为 `ChapterVersionGraphInput`，并为 strict codec 增加数据库 scope 和事务错误映射。
3. C1/D1 将 Storyboard `ReferenceContext` 接入 current Story，并将 Stable Shot ID 绑定服务端 requestId。
4. E1 直接消费 `resolveChapterProductionState`，前端不要根据 `Chapter.status + updatedAt` 重算 freshness。

## 不应宣称

- G2 总体完成。
- DB-only 生产切换、四层版本写入、worker applicability、真实 Preflight 聚合或 UI 完成。

