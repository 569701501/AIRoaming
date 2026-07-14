---
doc_id: AIR-G05-W1-RUNTIME-001
status: passed_isolated
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, luna, human
source: fresh SQLite DB-only Playwright/API and file-mode regression
---

# W1 Runtime Review

## 结论

`passed_isolated`。运行只使用系统临时目录、fresh SQLite、正式 Prisma migration、loopback fake provider；没有读取真实 workspace、默认用户 Keychain、真实凭据或真实 provider。

## 证据

- DB-only：`AIROAMING_E2E_PERSISTENCE_MODE=db corepack pnpm exec playwright test tests/e2e/api/g2-db-web-gate.spec.ts --workers=1 --repeat-each=3`，3/3 通过。
- file-mode：`corepack pnpm exec playwright test tests/e2e/web/project-library-and-stage-rail.spec.ts --workers=1 --repeat-each=3`，3/3 通过。
- Server 定向：`w1-web-route.spec.ts` + `project-db-persistence.integration.spec.ts`，2 files/36 tests 通过。
- 根回归：shared 8 spec/39 tests、server 70 spec/474 tests 通过；typecheck、e2e typecheck、build 通过。

## 路径核对

- Story → Storyboard → Preflight 顺序点击在 DB mode 成功。
- DB 页面显示 `story-db-versioning-status`、`storyboard-db-versioning-status`、`preflight-db-versioning-status`。
- legacy Story PATCH 在 DB mode 被拒绝，没有写入 file。
- server 启动前对 fresh DB 执行正式 migration；没有复用开发数据库。

## 限制

这是隔离 Runtime，不是 R0B/R1/R2 真实切换证据；真实运行必须等待固定人工授权门。
