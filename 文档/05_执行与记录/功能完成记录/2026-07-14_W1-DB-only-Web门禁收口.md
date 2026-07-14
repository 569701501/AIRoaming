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

## 纠偏补丁

- 新 Story 在已有 Storyboard/Preflight 时保留 `storyboard_done` 里程碑，避免 G1 单调性触发器拒绝事务；旧 Board/Preflight 继续保留并由 ProductionState 派生 stale。
- DB Workbench 的 workflow 改为读取 `ChapterProductionQueryService`，页面实际显示 `来源已变化`，不再使用 legacy 文件 workflow 覆盖 DB freshness。
- 新增 dirty gate、并发 CAS 冲突、stale 页面和历史复制的 DB-only E2E；整份 spec `repeat-each=3` 为 6/6 通过。

## 已知风险

- 并发 CAS 以隔离 browser-owned API client 验证协议级一成功一 409；页面 409 恢复逻辑已有 store/定向测试，未宣称真实双窗口录像。
- 当前只证明隔离 DB-only，不代表真实切换已执行。

## 后续

独立提交：W1 原提交 `3898182 feat(web): close g2 db-only workbench gate`；纠偏补丁 `4fe1dfa fix(web): close g2 stale milestone gate`。

现在停止在 `WAIT_R0B_AUTH`，等待用户明确授权 R0B；不得自行读取真实源或执行 C0～C7。
