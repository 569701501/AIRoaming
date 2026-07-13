---
doc_id: AIR-D2-A1-2-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1-2 实施契约
---

# D2-A1-2 测试矩阵

| ID | 验证目标 | 必须证据 |
| --- | --- | --- |
| KEY-01 | Keychain put/get | fake executor 记录安全参数，get 返回 secret，stdout 不落日志 |
| KEY-02 | replace/delete | 新 ref/fingerprint 可读；旧 ref 删除由显式调用完成；delete 幂等 |
| KEY-03 | unavailable/error | 非 macOS、命令失败、权限失败均稳定 fail-closed |
| FILE-01 | 原子 settings 写 | temp 0600、fsync、rename 后目标只含 metadata |
| FILE-02 | 写失败回滚 | write/fsync 失败旧文件字节不变、无 temp 明文残留 |
| FILE-03 | rename 失败回滚 | rename 失败旧文件字节不变、无 temp 明文残留 |
| RED-01 | 递归 redactor | 对象、数组、Buffer/Uint8Array、敏感 key 全部脱敏，非敏感文本保留 |
| SEC-10 | 全链路 sentinel | DB、settings、migration report、log、task/artifact、export fixture 命中即失败，干净 fixture=0 |
| CAP-01 | registry | settings capability implemented、restartCovered=true、有证据；其他 capability 不变 |
| CAP-02 | CLI gate | report 退出 0；check 退出 2；blockedIds 从 7 变 6 |
| REG-01 | 全量门禁 | server tests、workspace/server typecheck、G1 manifest/schema/migration、Prisma validate、diff check 全绿 |

## 命令

```text
pnpm --filter @airoaming/server exec vitest run src/settings src/migration/credential-redactor.spec.ts src/migration/db-capability-registry.spec.ts
pnpm --filter @airoaming/server typecheck
pnpm -w typecheck
pnpm --filter @airoaming/server prisma:validate
pnpm --filter @airoaming/server g1:manifest:check
pnpm --filter @airoaming/server g1:schema:check
pnpm --filter @airoaming/server g1:migration:check
pnpm --filter @airoaming/server test -- --testTimeout=20000
git diff --check
```
