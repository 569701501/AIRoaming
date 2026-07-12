---
doc_id: AIR-G2-A1-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2-A1 DB overlay / Repository substrate
---

# Scrutiny Review

## 静态检查

- `0009_g2_version_freshness_overlay/migration.sql` 没有 `CREATE TABLE`（只有一个 TEMP guard table），没有新列、回填或 rebuild；正式对象为 2 个 partial unique index + 14 个 `trg_g2_*` trigger。
- `g2-overlay-contract.ts` 只包含固定名称、SQL 形状检查和 SQLite 直接 inventory 检查；没有 CLI、review bundle、签名或 CAS。
- `VersionTransactionRunner` 只负责 `$transaction` 与 `SQLITE_BUSY/LOCKED`、unique 的最多三次全事务重试；repository contract 禁止向 Controller 暴露 Prisma model。
- G1 八条 migration SQL、G1 八个 runtime name/checksum 常量未改。为容纳正式 0009，只在 G1 tree/ledger 加入“已知 G2 overlay 可共存”的过滤；未知额外条目仍 fail closed。

## 契约检查

- Chapter Working Copy 严格区分 empty/clean/dirty；已有 current Script 时清空文本进入 dirty。该合法形状已同步到 G1 0008 CHECK、manifest 和 migration checksum，供 B1 clear 命令使用。
- Story/Storyboard pending partial unique index 保证每章最多一个 active pending；非 legacy pending 强制 V2；confirm/current/preflight/shot/task 的可由关系证明部分均有固定 `AIR_G2:<trigger>` 错误。
- SQLite 无法自行重算 SHA-256，也不能感知 session/task 发起者；digest 等值、source snapshot、完整 applicability/current-historical 和条件 UPDATE 行数留给应用 transaction。
- G2 runtime ledger helper 可验证完整 0001–0009 九行，但 A1 不把它接入 G1 Projects 启动门禁，避免在 API 命令尚未完成时误宣称 G2 capability 已启用。

## 测试证据

- `corepack pnpm -w typecheck`：shared/server/web 通过。
- `corepack pnpm test`：Shared 6 个 spec/34 条测试；Server 30 个 spec/171 条测试，全部通过。
- `g1:manifest:check`：通过，当前 manifest digest 为 `sha256:3d843e2a77b9a1acc44f4e49430a40514df92b10defe4143dc52aaaf1514a036`；0008 Working Copy CHECK 已同步 current Script + 空 dirty 形状。
- `git diff --check`：通过。

## Runtime/User Review

- G2 overlay 通过 fresh 0001–0009 SQLite deploy、对象 inventory 和临时 guard 清理检查。
- A1 没有新增真实页面、worker、导出物或 provider 调用；用户路径、四层版本命令和完整 task applicability 留给后续切片。

## 结论

静态契约、fresh migration 和既有 G1 回归均通过；A1 可 handoff。不得把本阶段称为 G2 完成，仍需 B/C1/D1 的四层命令、source snapshot builder、NewWorkGate、API 和 worker applicability。
