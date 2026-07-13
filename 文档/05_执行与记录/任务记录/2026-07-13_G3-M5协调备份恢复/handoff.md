---
doc_id: AIR-G3-M5-HANDOFF-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、implementation_contract.md、acceptance_checklist.md
---

# Handoff：交给 5.6 Luna 的 G3-M5 施工入口

## 1. 开工结论（历史入口）

- M4 已正式验收通过；可以开始 M5-A0。
- 初始 Luna 交接只领取 capability registry + CLI，不同时实现 backup/restore；该 A0～A3 施工已在当前分支完成并验收。
- M4 验收 HEAD 为 `65c90fe`；开发必须从包含本 handoff 的后续文档提交开始。
- 真实 production workspace/DB/SecretStore、final import、activate 均未授权。

## 1.1 当前交付状态

- M5-A0 capability registry、M5-A1 coordinated backup、M5-A2 sealed restore、M5-A3 restart/API rehearsal 均已完成。
- 当前 HEAD 的独立提交顺序为：A0 `91a450c`、A1 `b767e30`、A2 `0f20cff`、A3 `68bb694`；最终文档记忆同步提交为 `fb56180`。
- M5 完成只代表临时根演练通过；required capability、SecretStore、final importer、pre-cutover 和 activate 仍阻塞 M6。

## 2. 必读顺序

1. `文档/05_执行与记录/任务记录/2026-07-13_G3-M5协调备份恢复/task_plan.md`
2. 同目录 `implementation_contract.md`
3. 同目录 `acceptance_checklist.md`
4. `文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md`
5. `文档/06_测试与验收/G3-M施工包_可执行验收与Luna交接.md`
6. `文档/06_测试与验收/G1数据库迁移执行与验收清单.md` 第 9、12～14 节

## 3. 第一张 Luna 任务书：M5-A0

```text
目标切片：G3-M5-A0 DB capability registry + CLI
基线：从包含 2026-07-13_G3-M5协调备份恢复/handoff.md 的提交开始

允许修改：
- apps/server/src/migration/db-capability-registry.ts
- apps/server/src/migration/db-capability-registry.spec.ts
- apps/server/src/migration/db-capabilities.cli.ts
- apps/server/package.json
- 本任务目录 progress/findings/evidence

禁止修改：
- apps/server/prisma/schema.prisma
- apps/server/prisma/migrations/**
- 既有 importer/verifier 生产逻辑
- Settings/SecretStore、backup/restore、final importer、activate
- 默认/真实 workspace、真实 DB、真实 Keychain

实现契约：
- 使用 implementation_contract.md 的 8 个稳定 capability ID 和三态字段。
- 只按公开 Service/API 路径判定；内部 repository/importer 能力不能标绿。
- db:capabilities --format json 输出完整 registry。
- db:capabilities --check --format json 在当前基线必须退出 2，code=MIGRATION_CAPABILITY_BLOCKED。
- 缺值/非法/重复 --format 在 Prisma 初始化前返回 DB_CAPABILITIES_ARGS_INVALID。
- implemented 项必须有证据测试 ID；CAP-02 防止无证据手填 completed。

最小测试：
- CAP-01、CAP-02
- corepack pnpm --filter @airoaming/server typecheck
- corepack pnpm --filter @airoaming/server test -- --run src/migration/db-capability-registry.spec.ts
- corepack pnpm --filter @airoaming/server test -- --pool=forks --poolOptions.forks.singleFork=true --reporter=dot
- G1 manifest/schema/migration check
- git diff --check

退出证据：
- 当前 registry JSON 脱敏摘要
- --check 的稳定阻断码和退出码
- 变更文件、测试命令、结果、残留 unsupported 列表
- 单独 commit；不要继续领取 M5-A1

Stop：
- 需要改 Schema/migration 才能列 registry
- 需要把未覆盖能力标 implemented 才能通过测试
- 需要访问真实数据或 SecretStore
```

## 4. A0 完成后的顺序

1. 先做 Scrutiny Review，确认 registry 没有把 importer 能力冒充 runtime capability。
2. 提交 A0。
3. 再单独领取 M5-A1 coordinated backup。
4. A1/A2/A3 的详细输入输出与用例已在本任务包固定，不允许自行合并到 final/cutover。

## 5. 明确不能声明

- 不能声明 G3 production-ready。
- 不能声明 DB capability 全绿。
- 不能声明 SecretStore 或 Settings DB-only 已完成。
- 不能运行 `db:import --kind final`、`app:backup --kind pre-cutover` 成功路径或 `db:activate`。
