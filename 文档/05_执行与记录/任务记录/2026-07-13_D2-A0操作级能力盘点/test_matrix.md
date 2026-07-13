---
doc_id: AIR-D2-A0-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A0 实施契约
---

# D2-A0 测试矩阵

| ID | 验证目标 | 方法 | 通过标准 |
| --- | --- | --- | --- |
| D2-A0-REG-01 | 聚合 registry 仍有 8 个稳定 ID | `db-capability-registry.spec.ts` | ID 顺序和数量不变，无重复 |
| D2-A0-REG-02 | 操作 registry 覆盖所有门禁 | 从 `project-repository.service.ts`、`projects.service.ts` 扫描正则，与 `getDbCapabilityOperations()` 比较 | 两个集合完全相等，数量 36 |
| D2-A0-REG-03 | 操作字段完整 | 单测遍历所有操作 | owner、sourceFile、sourceSymbol、读写状态、证据字段均有效 |
| D2-A0-REG-04 | 当前只有已证明 task create 为绿色 | 单测检查状态和证据 | `generation_task_create` implemented 且有稳定用例，其余门禁 unsupported 且无证据 |
| D2-A0-REG-05 | 聚合不会被操作级缺口遮蔽 | 用 registry + operations 调用 `getBlockedDbCapabilities` | 7 个 required capability blocked，task capability 可保持 green |
| D2-A0-CLI-01 | CLI 报告操作级数据 | `pnpm --filter @airoaming/server exec tsx src/migration/db-capabilities.cli.ts --format json` | JSON 有 8 个 capability、36 个 operation、稳定 blockedIds |
| D2-A0-CLI-02 | 激活门禁继续关闭 | CLI 加 `--check` | 退出码 2，code=`MIGRATION_CAPABILITY_BLOCKED` |
| D2-A0-CLI-03 | CLI 不初始化 Prisma | CLI 单测使用无 Prisma 环境 | 报告和 check 都不触发数据库连接 |
| D2-A0-CLI-04 | 参数错误语义不变 | 重复 `--format` 或非 json | 退出码 1，stderr=`DB_CAPABILITIES_ARGS_INVALID` |
| D2-A0-STATIC-01 | 文档/代码边界没有越界 | `git diff --name-only` | 只涉及 registry、CLI、spec 和 D2-A0 文档 |

## 推荐命令

```bash
pnpm --filter @airoaming/server exec vitest run src/migration/db-capability-registry.spec.ts
pnpm --filter @airoaming/server typecheck
pnpm --filter @airoaming/server exec tsx src/migration/db-capabilities.cli.ts --format json
pnpm --filter @airoaming/server exec tsx src/migration/db-capabilities.cli.ts --check --format json
git diff --check
```

`--check` 预期退出码为 2，不应把它当作命令失败；要检查输出中的稳定阻断码。
