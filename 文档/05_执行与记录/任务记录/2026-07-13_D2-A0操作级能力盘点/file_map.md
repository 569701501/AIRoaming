---
doc_id: AIR-D2-A0-FILEMAP-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer
source: D2-A0 当前代码探索
---

# D2-A0 文件与函数地图

| 文件 | 入口/符号 | D2-A0 责任 |
| --- | --- | --- |
| `apps/server/src/migration/db-capability-registry.ts` | `CapabilityStatus`、`DbCapabilityEntry`、`DbCapabilityOperation` | 静态聚合与操作级事实源；深拷贝 getter；校验；blocked 计算 |
| `apps/server/src/migration/db-capabilities.cli.ts` | `main` | 输出聚合 capability、操作级清单和 blockedIds；保持无 Prisma |
| `apps/server/src/migration/db-capability-registry.spec.ts` | `M5-A0`、`D2-A0` describe | 聚合回归、源码覆盖扫描、字段/状态/CLI 行为 |
| `apps/server/src/projects/project-repository.service.ts` | `assertDatabaseOperationSupported`, `clearProjectChaptersDir`, `clearLegacyStoryDir` | 两个 Repository 门禁调用点的来源 |
| `apps/server/src/projects/projects.service.ts` | 其余 34 个门禁调用点 | 公开 Service/Task guard 门禁的来源 |
| `文档/04_方案与决策/2026-07-13_G3-D2与M6推进路线.md` | D2-A0～A8 顺序 | 上游/下游阶段边界；不可跳到 M6 |

## 操作来源分布

- `project-repository.service.ts`：2 个调用点。
- `projects.service.ts`：34 个调用点，其中 `generation_task_create` 位于 `guardGenerationTaskCreate`。
- 总计：36 个唯一操作。

## owner 映射

| capability | ownerModule | 后续切片 |
| --- | --- | --- |
| project/chapter/script | `projects/project-repository` | D2-A2 |
| outline/story/storyboard/preflight | `projects/versioning` | D2-A2、D2-A3 |
| character/scene/asset/candidate lock | `projects/character-asset-candidate` | D2-A3 |
| layout/export | `projects/layout-export` | D2-A4 |
| task lifecycle | `tasks/persistent-task-repository` | 已有 G2 证据；D2-A0 只登记 |
| dialogue runtime | `dialogue/runtime` | D2-A5；当前无门禁调用点 |
| settings/secret store | `settings/secret-store` | D2-A1；当前无门禁调用点 |
| delete/outbox | `projects/delete-outbox` | D2-A6 |

## 读取规则

实现者先读 registry、spec 和本地图，再修改业务代码。若发现源码新增门禁，先补操作登记和测试，不能绕过 D2-A0 直接进入下游实现。
