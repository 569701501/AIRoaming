---
doc_id: AIR-D2-A0-SCRUTINY-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa, reviewer
source: D2-A0 代码与施工资料复核
---

# D2-A0 Scrutiny Review

## 结论

`passed_for_d2_a0`。本切片只完成操作级盘点和 fail-closed 收紧，没有进入 D2-A1 或修改业务 DB 写实现。

## 静态证据

- 8 个聚合 capability 保持原有 ID、状态和 blocker；required blocker 仍为 7 项。
- `getDbCapabilityOperations()` 登记 36 个操作；测试从两个真实 Service 源文件扫描门禁调用，集合完全相等。
- 每项包含 owner、来源文件/符号、读状态、写状态、证据数组；所有写门禁读状态为 `not_applicable`。
- 只有 `generation_task_create` 标记 implemented，并绑定 DB guard 集成测试；其余 35 项保持 unsupported 且无 evidence。
- 聚合 blocked 计算现在额外检查操作级状态和证据。
- CLI 输出聚合与操作两层 JSON，未引入 Prisma 或 workspace 读取。

## 验证命令

```text
pnpm --filter @airoaming/server exec vitest run src/migration/db-capability-registry.spec.ts  # 5 passed
pnpm --filter @airoaming/server typecheck                                                       # passed
pnpm --filter @airoaming/server test                                                            # 49 files / 341 tests passed
apps/server/node_modules/.bin/tsx apps/server/src/migration/db-capabilities.cli.ts --format json # exit 0
apps/server/node_modules/.bin/tsx apps/server/src/migration/db-capabilities.cli.ts --check --format json # exit 2
git diff --check                                                                                # passed
```

## 残留风险

- 后续 D2 切片必须以公开 Service/API、重启和旧文件隔离证据逐项更新 operation 状态，不能只更新聚合项。
- 源码覆盖测试当前扫描字面量调用；若未来改成动态 operation 字符串，必须显式扩展扫描规则和登记契约。

## 下一步

提交本切片后，才可把 D2-A1 Settings + SecretStore 施工资料交给 Luna；不得跳到 D2-A2 或 M6。
