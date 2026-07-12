---
doc_id: AIR-TASK-20260712-G1-CORRECTION-PLAN
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 2026-07-12 G1 实施失控复盘与用户执行授权
---

# G1 纠偏与 DB 垂直切片任务计划

## 1. 目标

1. 将自签 Reviewer/attestation/sealed bundle/CAS 从 Schema 与 migration 写入关键路径移除。
2. 保留直接证明数据库产物正确的 manifest freshness、Schema exact、Prisma validate、migration replay、SQLite integrity/FK/约束测试。
3. 生成仓库内正式 Prisma migration tree。
4. 交付 Project/Chapter/Script 的最小 DB-only 垂直切片：创建项目、保存章节草稿、完成章节、关闭并重建应用上下文后从 SQLite 读回。
5. 把 G2 开始条件从“完成全部 G1/WIT-01”改为“最小 DB substrate 与当前/版本事务已通过”，使版本与 freshness 能按垂直切片继续。

## 2. 非目标

- 本任务不迁移或修改真实 `workspace/`、真实设置、真实密钥或用户数据库。
- 不执行生产停写、真实 snapshot、正式 DB-only 激活或删除 file runtime。
- 不在本阶段实现 Dialogue、SecretStore、持久任务、Asset/Outbox、Layout/Export 的完整 DB 接管。
- 不重写 G2～G5 全部功能；只解除错误前置依赖并建立可继续开发的真实 DB 基座。

## 3. 决策

- Reviewer 文档可以作为历史人工意见保留，但不再构成运行时信任或写入授权。
- “独立审查”只有在存在外部身份/权限边界时才可称为双签；同一 Codex/同一工作区不构成独立信任域。
- migration writer 的授权条件收敛为：manifest 自摘要与源文件当前、Schema 与 manifest 精确一致、目标 tree 不存在、staging 与最终 tree 字节/路径/单链接精确一致。
- 先运行真实 artifact，再审查；禁止再次出现“先签 manifest，后首次运行 Prisma validate”。
- 复杂度预算：非领域流程代码不得超过当前阶段生产改动的 10%；连续 90 分钟没有新增可运行业务行为时必须停止扩基础设施并回到最小切片。

## 4. 阶段与退出标准

| 阶段 | 交付 | 退出标准 | 状态 |
| --- | --- | --- | --- |
| C0 冻结错误路径 | ADR、任务计划、旧总控标记被纠偏任务接管 | 范围、非目标、复杂度预算明确 | `completed` |
| C1 简化生成链 | 删除 review gate 生产依赖与 package scripts；直接校验 manifest/schema/migration | review 代码不再被生产入口引用；定向测试全绿 | `completed` |
| C2 正式 migration | `prisma/migrations/migration_lock.toml` + `0001～0008/migration.sql` | Prisma validate、fresh deploy、二次 no-pending、integrity/FK、exact tree 全绿 | `completed` |
| C3 DB 垂直切片 | Prisma 生命周期 + Project/Chapter/Script DB Repository/Service | 创建、草稿、完成、重启读回集成测试通过；file 模式现有测试不回归 | `completed` |
| C4 文档与门禁 | 更新 G1/G2 计划、QA、模块边界和聚合测试 | `test:all` 稳定通过；文档无旧双签前置冲突 | `completed` |
| C5 复核 | Scrutiny + 隔离 Runtime Review | 静态通过；临时 SQLite 用户路径通过 | `completed` |

## 5. 验收标准

- `rg` 证明生产代码不存在 `g1-schema-review-*` 依赖和 review publish/recover 脚本。
- 正式 migration tree 已进入仓库并由 deterministic checker 精确验证。
- 没有 `PrismaClient` 仅停留在生成器；至少一个公开/生产 Service 路径实际通过 Prisma 持久化 Project/Chapter/Script。
- 同一个临时 SQLite 数据库在应用上下文重建后读回相同项目、章节草稿和正式剧本版本。
- 真实 workspace/settings/secret 的 hash、mtime 与服务不被触碰。
- 根级 build、typecheck、Vitest、E2E 聚合门禁通过；若现有聚合并发解析问题仍存在，必须在本任务内修复，不得豁免。

## 6. 回滚

- 所有运行验证只使用带 marker 的临时 dataRoot/workspace。
- C1/C2 仅修改仓库源码与 migration artifact，不连接真实数据库。
- DB 垂直切片通过 `AIROAMING_PERSISTENCE_MODE=db` 显式启用；默认 file 模式在完整切换前保持不变。
