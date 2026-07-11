---
doc_id: AIR-TASK-20260711-G1-G5-IMPLEMENTATION-FINDINGS
status: active
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 事实源与代码只读审计
---

# Findings

## 已确认事实

- G0 已完成；整个 G0–G5 Goal 尚未完成，当前从 G1 开始。
- `apps/server/prisma/schema.prisma` 只有 6 个未接线模型，无 migration history、PrismaService、UoW 或业务 CRUD。
- `ProjectRepository` 的 Map + workspace 扫描/整树重写仍是业务事实源；`ProjectStore.getReadyProject()` 读取时也可能写盘，不能复用为 DB-only 查询层。
- `TasksService`、Dialogue threads 和多类 pending 仍在内存；图片候选与角色/场景各有独立 Promise 队列。
- `SettingsService` 仍把文本和三类图片 key 明文写入 `app-settings.json`，公开 DTO 仍含 `keyPreview`。
- Asset 直接写最终路径后再保存聚合，没有 staged/ready、sha256、Outbox 或恢复扫描；项目删除与迟到 worker 存在竞态。
- G0 E2E 只有临时 workspace，尚无独立 dataRoot/fake SecretStore marker；直接注入 `e2e-fake-key` 不能作为 G1 泄密验收。

## 实施前决议

旧数据中的 `chapter_001`、`shot_001`、`script_outline_current` 等 ID 只在项目/章节作用域稳定，不能直接进入全局字符串主键。G1 importer 使用：

```text
sourceKey = workspace-v1:<projectId>:<entityType>:<legacyId-or-relative-key>
entityId  = stable scoped rekey(projectId, entityType, legacyId-or-relative-key)
```

- 原 legacy ID、路径和摘要保存在 `ImportedEntitySource`。
- project ID、已验证全局唯一且无碰撞的旧 ID 可以保留；作用域 ID 必须稳定重键。
- 新 runtime 实体使用 UUID v4。
- 现有容错型 `ProjectRepository` 不能作为 importer；必须新建严格、只读、确定性的 `LegacyWorkspaceReader`。

## 新增门禁

- `ENV-01～04`：三根隔离、marker、环境秘密清洗、真实目录不变。
- `SCH-00`：精确核对 44 个领域模型及约束，不允许缺失或额外业务表。
- `TSK-00`：没有完整 TaskPolicy 的 runtime task 不得创建。
- `OTB-01～05`：Outbox claim/fencing/幂等/backoff。
- `DEL-00`：deleting 项目拒绝新写和新任务。
- `MNT/SNP/RUN`：同 PID maintenance、snapshot 与无秘密 runtime bundle。
- `ACT-01～08`：DB-only 启动/激活/fallback 禁止/firstBusinessWriteAt。
- `WIT-01`：旧 fixture 经正式 snapshot/import 后以 DB-only reopen，语义等价。

## 风险

1. scoped legacy ID 全局碰撞。
2. file mode 读取即写入，误接线会污染旧源。
3. 整聚合保存与双 Promise 队列导致并发丢更新。
4. SecretStore 迁移后旧二进制不能恢复 plaintext，回滚必须使用兼容 G1 版本。
5. M4 正式切换是外部状态变更，必须在动作发生前重新取得用户明确授权。

