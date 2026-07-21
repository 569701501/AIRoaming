---
doc_id: AIR-ADR-0015
status: active
created: 2026-07-12
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 44 表/194 trigger 建模审查、G3-M4 verifier 代码复核与用户确认
---

# ADR-0015 G1 生成器渐进退役与发布 Schema 身份

## 1. 决策状态

已采纳并执行。用户于 2026-07-12 确认渐进退役，2026-07-21 在 DB-only、R2、G4/G5 和最终用户签收均完成后明确授权代码收缩。

## 2. 背景与问题

- G1 已生成并冻结 44 个模型、0001～0008、195 个 CHECK 和 194 个 trigger；G2/G3 已追加 0009/0010 小型 overlay。
- G1 Markdown/DSL→manifest→Schema/migration 生成链约 1.23 万行，且把完整 `apps/server/package.json` 纳入 source closure；新增无关 package script 会造成 manifest stale。
- 当前 G3-M4 verifier 草稿直接把 G1 manifest digest 写为 `effectiveSchemaManifestDigest`。该 digest 会受无关 supporting source 影响，且 G1 manifest 明确不包含 0009/0010，不能代表当前发布数据库结构。
- G1 exact check 与 overlay allow-list 是历史基线保护，不应继续成为 0011+ 新 Schema 演进的生成事实源。

## 3. 决策

G1 生成器采用渐进退役；当前发布 Schema 身份改由已冻结 Prisma Schema 与按序 migration artifact checksum 计算，G1 manifest digest 仅表示历史生成 provenance。

### 3.1 不变量

- 不重写 0001～0010，不改变现有 44 表、195 CHECK、194 trigger 的物理语义。
- `sourceManifestDigest` 只标识 migration 输入 workspace；`effectiveSchemaManifestDigest` 只标识当前发布数据库结构，二者不得互换。
- 发布 Schema identity 不读取 `package.json`、应用 commit、CLI script 或 importer 源码。
- release identity 自动枚举正式 migration 目录，新增 migration 不会被摘要忽略；runtime ledger 仍使用显式 catalog，未同步 catalog 的未知 migration 不会被应用启动放行。
- G1 生成器退役前仍可复现旧基线，但 verifier、activate 和 runtime 不得依赖其 source closure。

### 3.2 发布 Schema identity v1

identity v1 对以下 canonical payload 计算 SHA-256：

```json
{
  "schemaVersion": 1,
  "kind": "airoaming_release_schema_identity_v1",
  "databaseEngine": "sqlite",
  "prismaSchema": {
    "path": "apps/server/prisma/schema.prisma",
    "checksum": "sha256:..."
  },
  "migrations": [
    { "name": "0001_persistence_and_migration", "checksum": "sha256:..." },
    { "name": "0010_g3_comic_format_immutable", "checksum": "sha256:..." }
  ]
}
```

migration 必须按正式执行顺序列出。Overlay contract 继续独立验证对象 shape；其 TypeScript 源码摘要不进入物理 Schema identity，避免重新引入工具源码耦合。

### 3.3 渐进退役阶段

1. 当前阶段：冻结 G1 generator，不再接受新业务；收窄 package closure，独立校验 Prisma 版本。
2. 0011+：直接维护 `schema.prisma` 和向前 migration，每个 overlay 配轻量 contract，并显式扩展 runtime migration catalog；release identity 会自动纳入新的有序 migration artifact。
3. 过渡期：保留 G1 generator 只用于 0001～0008 历史复现和 byte-exact 证明。
4. 退役门槛：full shadow 两轮、final import、DB-only activate、协调 backup/restore 和一个稳定发布周期全部完成。
5. 退役后：保留历史 manifest、0001～0010、checksum、Prisma Schema 和必要 SQLite 特征测试；删除活跃 DSL/source rebuild/write CLI。

2026-07-21 执行结果：上述门槛已满足。活跃生成器 16 个生产文件、7 个专用测试和 6 个 package script 已退役；历史 manifest、`schema.prisma`、0001～0017、release identity、runtime ledger、备份恢复及真实 SQLite trigger 语义测试继续保留。后续 Schema 只允许使用 forward-only migration + 小型 overlay contract。

### 3.4 非目标

- 本 ADR 不授权执行真实 DB-only activate。
- 本轮不删表、不删 trigger、不修改 Task materialize 状态机。
- 本轮不提前实现 0011 migration。
- 本轮不把 G3-M3 未完成 importer 宣称为 full importer。

## 4. 被否决的备选

| 备选 | 优点 | 否决原因 |
| --- | --- | --- |
| 永久保留 G1 生成器为唯一 Schema 事实源 | 历史复现路径单一 | 永久承担 1.23 万行维护成本，且会阻塞 0011+ 与小型 overlay 演进 |
| 立即删除生成器 | 立刻减少代码量 | G3-M4/M5/M6 尚未完成，失去旧基线复现与迁移切换期证据 |
| 给 G1 manifest 新增通用多层 source role/hash DSL | 可继续扩展 generator | 为计划退役的系统继续增加抽象，收益低且扩大风险 |
| 继续用 G1 manifest digest 作为 effective identity | 无需新增模块 | digest 受无关源码影响且遗漏 0009/0010，语义错误 |

## 5. 影响与后果

### 正向后果

- package script、importer 和 CLI 改动不再改变发布 Schema identity。
- verifier/activate 能准确绑定 0001～当前 overlay 与 Prisma runtime 结构。
- 0011+ 延续小 migration + 小 contract，不再扩大 G1 DSL。

### 代价与限制

- 过渡期同时保留历史 G1 provenance 与新 release identity，两者名称和用途必须清楚。
- 每个新 migration 都必须显式扩展 runtime catalog；identity 自动纳入目录只代表“身份发生变化”，不等于 runtime 自动放行。
- 退役删除动作必须等待 DB-only 稳定期，不能在 importer/cutover 中途进行。

| 影响面 | 变化 |
| --- | --- |
| 产品与用户流程 | 无 |
| 数据模型 | 无表/字段变化；只修正发布身份计算 |
| API / 任务协议 | `db:verify` 报告中的 `effectiveSchemaManifestDigest` 改用 release identity |
| 文件与 Asset | 无 |
| 后端模块 | release Schema identity 成为唯一发布身份；G1 活跃生成器和 package commands 已退役 |
| 测试与验收 | 保留 package 独立性、Schema/migration drift、runtime ledger、verifier identity 与真实 SQLite trigger 语义测试 |

## 6. 兼容、迁移与切换

- 现有 `schema.prisma`、0001～0010 和 trigger SQL 不改字节。
- 尚未形成 final verification/ready_for_activation 的临时 shadow 数据无需迁移。
- 已生成的旧 verification report 不再作为 activate 证据，必须使用新 release identity 重跑。
- `firstBusinessWriteAt` 不受本轮影响；真实切换仍遵守 ADR-0012 与 G3-M C0～C7。

## 7. 风险与回滚

| 风险 | 影响 | 预防或检测 | 回滚方式 |
| --- | --- | --- | --- |
| identity 漏掉 migration | 错误绑定旧发布身份 | 自动枚举有序目录、新 migration 改变 digest、runtime catalog 仍 exact | 回退 verifier 接线，不修改数据库 |
| closure 修正意外改变结构产物 | 历史 Schema/migration 漂移 | 修改前后 byte checksum、G1 三项 check、Prisma validate | 回退 source allow-list/manifest artifact |
| Luna M4 草稿被覆盖 | 丢失并行开发成果 | 保留其 CLI、Service 和测试，只替换 effective identity 来源 | 回退本任务改动，不删除 Luna 文件 |

## 8. 验证标准

- [x] package script 改动不改变 release Schema digest。
- [x] 任一 migration SQL 或 `schema.prisma` 改动会改变 release Schema digest。
- [x] release identity 当前精确包含 0001～0017；新增有序 migration 会自动进入 identity 并改变 digest，runtime 未登记时仍 fail-closed。
- [x] `db:verify` 不加载 G1 source manifest。
- [x] `schema.prisma`、0001～0017 migration SQL、历史 manifest 和现有 trigger 字节不变。
- [x] 退役前 G1 三项 exact check 通过；退役后 Prisma validate、全仓 typecheck、server build、43 个保留契约定向测试和 server 129 files / 790 tests 全部通过。
- [x] 用户页面不变；运行复核由真实 SQLite trigger 语义、fresh migration、DB-only 集成及 backup/restore 测试覆盖。

## 9. 关联资料

- 审查：`文档/05_执行与记录/任务记录/2026-07-12_数据库建模审查/`
- 实施：`文档/05_执行与记录/任务记录/2026-07-12_发布Schema身份解耦/`
- 上游：ADR-0012、ADR-0014、G3-M 五份施工资料
