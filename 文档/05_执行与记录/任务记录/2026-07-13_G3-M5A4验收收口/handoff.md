---
doc_id: AIR-G3-M5-A4-HANDOFF-001
status: completed_a4_1
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、implementation_contract.md、acceptance_checklist.md
---

# Handoff：M5-A4-1（已完成，等待后续切片复核）

## 1. 开工结论

本 handoff 原本只允许领取 `M5-A4-1 backup 一致性栅栏 + CLI 精确参数`；该切片现已完成并通过定向/全量回归，后续执行者不得把本记录当作 A4-2 的授权。

M5-A0～A3 的代码保留，不推倒重写；本轮修复了独立复核发现的 M5R-01/M5R-07，并补 A4-BAK-02 writer 证据。已完成后停止，等待独立复核和下一张 A4-2 任务书。

## 2. 必读顺序

1. 本目录 `findings.md`
2. 本目录 `task_plan.md`
3. 本目录 `implementation_contract.md` 第 1、5、7 节
4. 本目录 `acceptance_checklist.md` 的 A4-CLI-01、A4-BAK-01、A4-BAK-02
5. 原 M5 `implementation_contract.md` 第 2 节
6. `apps/server/src/backup/app-backup.service.ts`
7. `apps/server/src/backup/app-backup.cli.ts`
8. `apps/server/src/backup/app-backup-restore.integration.spec.ts`

## 3. 允许修改

```text
apps/server/src/backup/app-backup.service.ts
apps/server/src/backup/app-backup.cli.ts
apps/server/src/backup/backup-path.ts
apps/server/src/backup/backup.types.ts
apps/server/src/backup/app-backup-restore.integration.spec.ts
apps/server/src/backup/*backup*.spec.ts        # 如需按职责拆测试
文档/05_执行与记录/任务记录/2026-07-13_G3-M5A4验收收口/
```

## 4. 禁止修改

```text
apps/server/prisma/schema.prisma
apps/server/prisma/migrations/**
apps/server/src/migration/*importer*
apps/server/src/migration/db-import.cli.ts
apps/server/src/projects/**
apps/server/src/settings/**
apps/server/src/dialogue/**
```

禁止实现 restore identity、SecretStore、final importer、pre-cutover 成功路径或 activate；这些不属于 A4-1。

## 5. 必须实现

```text
1. app:backup 参数 parser 拒绝任何额外 bare positional、孤立 value、重复/未知/缺值 flag。
2. 参数失败发生在 Prisma 初始化、DB 连接、staging 创建之前。
3. coordinated backup 在读取 runs/issues/PersistenceState/Asset/settings 前取得 SQLite 写入栅栏。
4. DB 副本和 ready Asset inventory/复制在该栅栏保护的稳定区间完成；不得继续使用锁前读取结果生成 manifest。
5. 栅栏末尾证明 manifest 中的 DB 身份与副本直查一致。
6. fixture 注入：已有 writer 时失败；backup 已持锁时第二 writer 不能改变账本/Asset metadata；失败无 SEALED。
7. 既有 BAK-01 happy、ready Asset missing、pre-cutover blocked 回归不退化。
```

允许为了确定性并发测试抽取小型内部 fence/file-copy helper 或注入只用于测试的依赖接口；禁止添加生产环境测试开关、全局 env backdoor 或新的审查流水线。

## 6. 验证

```text
corepack pnpm --filter @airoaming/server test -- --run <包含 A4-CLI-01/A4-BAK-01/A4-BAK-02 的 spec>
corepack pnpm --filter @airoaming/server typecheck
corepack pnpm --filter @airoaming/server test -- --run src/migration/db-capability-registry.spec.ts src/backup/app-backup-restore.integration.spec.ts
git diff --check
```

## 7. 提交与交接证据

- 单独 commit，建议：`fix(migration): close coordinated backup consistency window`
- 在 `progress.md` 记录修改文件、命令、通过数。
- 在 `findings.md` 记录最终 fence 方案与任何残留风险。
- 不把未执行的 A4-2/A4-3/A4-4 标记通过。

## 8. Stop

遇到以下任一情况立即停止并报告：

- 必须修改 Schema/migration/trigger 才能获得一致性。
- 无法在临时 SQLite 中确定性证明 active writer/WAL 门。
- 只能通过继续使用锁前 Prisma 结果或放宽 manifest 校验让测试通过。
- 需要访问真实 workspace/DB/SecretStore。

## 9. A4-1 交付结果

- 定向 backup/restore spec：10/10 通过。
- server 全量回归：49 files/317 tests 通过。
- server/workspace typecheck、G1 manifest/schema/migration check、`git diff --check`：通过。
- A4-2/A4-3/A4-4、D2、M6：未执行。
