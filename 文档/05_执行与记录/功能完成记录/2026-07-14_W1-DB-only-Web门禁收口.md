---
doc_id: AIR-FEATURE-20260714-W1-DB-WEB
status: completed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: human, developer, qa, luna
source: W1 DB-only Web/API implementation
---

# W1 DB-only Web 门禁收口

## 功能摘要

为 Story、Storyboard、Preflight 接入 G2 DB Working Copy/Revision 路径，合并重复 Preflight confirm 路由，并建立 fresh SQLite DB-only 浏览器/API 门禁；DB 模式不再因 API 失败回写 legacy file。

## 影响范围

- Web API client、Workbench store、三个工作区状态提示。
- Server persistence facade、Story/Storyboard 历史复制接口、唯一 Preflight confirm 路由。
- E2E 环境、fresh migration 启动、API fixture PATCH 能力。

## 验证

- `corepack pnpm typecheck`、`corepack pnpm typecheck:e2e`、`corepack pnpm build`：通过。
- `corepack pnpm test`：shared 8 spec/39 tests，server 70 spec/474 tests，通过。
- 定向 server：2 files/36 tests，通过。
- DB E2E 与 file E2E：各 `repeat-each=3`，均 3/3 通过。

## 已知风险

- 双标签完整浏览器冲突路径仍需后续增强；CAS 和 409 恢复已实现并有集成证据。
- 当前只证明隔离 DB-only，不代表真实切换已执行。

## 后续

独立提交：`6b56b59 feat(web): close g2 db-only workbench gate`。

现在停止在 `WAIT_R0B_AUTH`，等待用户明确授权 R0B；不得自行读取真实源或执行 C0～C7。
