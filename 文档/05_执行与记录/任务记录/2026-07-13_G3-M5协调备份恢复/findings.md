---
doc_id: AIR-G3-M5-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前代码探索、M4 验收与 G1/G3-M 契约对照
---

# 发现

## 当前代码事实

- `apps/server/src/backup/` 已包含 coordinated backup、sealed restore、CLI 与集成测试；`apps/server/package.json` 已登记 `db:capabilities`、`app:backup`、`app:restore`。
- `SettingsService` 仍直接读写 `/workspace/settings/app-settings.json`，并在内存和文件中持有 apiKey；Provider shadow 只导入脱敏 DB metadata，不等于 runtime SecretStore capability。
- `AIROAMING_DATA_ROOT` 当前只在测试 fixture 中出现，生产代码没有统一 DataRoot service；M5 CLI 必须依赖显式 `--data-root`，不能推断默认根。
- `ProjectRepository.assertDatabaseOperationSupported()` 仍阻断大量公开 DB 写入口；内部 version repository 或 importer 可写表不能被 capability registry 当成公开能力完成。
- M4 verifier 只接受 shadow run；`db:import --kind final` 在 Prisma 初始化前 fail-closed。M5 coordinated backup 只能绑定已完整验证的 16-slice full-shadow 证据集，`pre-cutover` 必须保持阻塞。
- ready Asset 的物理位置由 DB `Asset.storageKey` 指向显式 workspace root；M5 只复制 DB 声明的 ready Asset，不扫描并自动收编孤儿文件。
- 项目已使用 Node 22 `node:sqlite` 做真实 SQLite 语义测试，可以在 M5 集成测试中复用 checkpoint/排他锁能力，无需为施工包先引入第三方 SQLite 依赖。

## 文档审查发现并已收口

- 原 backup CLI 没有携带 maintenance 封口证据；新增显式 `--maintenance-bundle`，复用现有 RuntimeBundleFileService。
- 原 manifest 没有明确 coordinated shadow 与 pre-cutover final 的 run 语义。M4 full importer 保留 16 条独立 MigrationRun，所以 coordinated backup 必须读取并验证 full-import report + decisions artifact，不能只依赖单个 `--run-id`；pre-cutover 才保留 final `--run-id`。
- 原 restore 写“空根”但未说明如何原子 rename；M5 materialize 明确要求目标路径不存在，verify-only 零写入。
- 两个目标根无法跨文件系统做单事务原子发布；契约改为每根原子 rename + 同 restore marker + 仅对本 run 产物做补偿清理，不声称跨根全局原子。
- `settings.redacted.json` 必须由 DB 非秘密表生成，不能为了 backup 再读取旧明文 settings。
- M5 工具开发与 D2 capability closure 分离：coordinated backup/restore 可以在临时根完成，但 `pre-cutover`/M6 必须继续由 capability/final/SecretStore 门禁阻断。

## 风险

- 未来实现若无法可靠证明 SQLite checkpoint + 排他写阻断，不能把普通文件复制标成 coordinated backup。
- runtime bundle 证明的是 closed 时封口状态，不单独证明复制期间没有 writer；两者必须与 SQLite 排他锁同时满足。
- capability registry 最容易被误用为“手写绿表”；必须由公开路径测试锁定，importer/内部 repository 测试不能替代。
- materialize 的补偿清理必须严格校验 restore marker，避免第二根发布失败时误删用户目录。

## M5 实现后发现

- A1 使用 Node 22 `node:sqlite` 执行 `wal_checkpoint(TRUNCATE)`、`BEGIN IMMEDIATE` 和副本 integrity/FK 检查；无 WAL 时 SQLite 返回 `log=-1`，应按“无待收敛 WAL”处理而不是误判失败。
- G1 Asset ready 只能通过 `staged → ready` 合法状态转移建立；直接 INSERT `status=ready` 会被既有 trigger 拒绝，演练 fixture 已按真实状态机构造。
- A2 restore 只接受 manifest/SEALED digest 完整的 bundle，并把两个目标根分别以相同 marker 原子发布；不宣称跨根全局事务原子。
