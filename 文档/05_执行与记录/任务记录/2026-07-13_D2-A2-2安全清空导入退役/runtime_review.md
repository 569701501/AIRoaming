---
doc_id: AIR-D2-A2-2-RUNTIME-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, qa, developer
source: A2-2 runtime review
---

# Runtime Review

## 结论

通过。验证在 fresh SQLite、临时目录和隔离 Nest 实例中完成，没有连接真实数据库、真实 workspace、用户 Keychain、provider 或凭据。旧 destructive 路由在任何业务写入前稳定返回 409；只读 impact preview 可执行且无副作用；G2 replacement 证据保持通过。

## 运行路径

1. 通过 `project-db-persistence.integration.spec.ts` 创建临时 DB 项目并完成章节/脚本基线。
2. 调用 reset、import、clear、legacy pending confirm/discard 路由，逐个断言 `LEGACY_WRITE_ROUTE_DISABLED`、operation、reason、replacement。
3. 调用 `GET /projects/:projectId/script/impact-preview`，断言章节工作稿、formal history、pending 和下游计数返回，且 DB/workspace 无写入。
4. 通过已有 G2 Working Copy/pending adopt-discard 路径验证 replacement 仍可用，并在重启/隔离场景读取同一 DB 投影。

## 证据

- A2-2 集成测试：15 项通过，其中退役路由与 impact preview 为新增覆盖。
- registry 测试：5 项通过，精确断言 7 retired、project implemented、blockedIds=5。
- 全量 server：54/54 文件，361/361 测试。

## 不执行项

- 未执行真实 workspace 的删除、覆盖或迁移。
- 未执行真实用户凭据、macOS Keychain 或 provider 调用。
- 未执行 D2-A3、D2-A6 Outbox consumer、final importer、M6 或真实 cutover。
