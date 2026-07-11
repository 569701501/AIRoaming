---
doc_id: AIR-TASK-20260711-G1-DB-CUTOVER-PROGRESS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, dba, qa
source: task_plan.md
---

# G1 D7 数据库事实源与切换推进记录

## 2026-07-11

- 用户确认继续 G1 D7 开发级文档。
- 使用 `$deep-think` 管理数据库、任务、素材、秘密和切换回滚的跨模块规划。
- 本轮只写文档，不修改 schema、migration、依赖、业务代码、数据库或真实 workspace。
- 已建立独立任务三件套。
- 已完整复核 ADR-0012、D7 原方案、G0 测试方案、系统架构、核心数据模型、任务协议、素材契约与模块边界。
- 已核对当前 Prisma schema、package scripts、ProjectRepository/Store、TasksService、TaskArtifact、Dialogue pending Maps、SettingsService、WorkspacePath 和真实项目文件树。
- 已复核 Prisma/SQLite/JCS 官方资料，收紧 enum/CHECK、migration drift、PRAGMA、短事务、WAL/backup 和规范摘要边界。
- 已新增 proposed 文档：
  - `文档/04_方案与决策/2026-07-11_G1数据库事实源与DB-only切换开发方案.md`
  - `文档/04_方案与决策/2026-07-11_G1数据库Schema字典与旧数据映射.md`
  - `文档/06_测试与验收/G1数据库迁移执行与验收清单.md`
- 文档已明确 44 个模型、Json codec/current 指针、M0–M6、runtime bundle、Asset/Outbox、SecretStore、停写、metadata 封存、回滚终点与 G0 witness 接替。

## 验证记录

- `pnpm --filter @airoaming/server exec prisma --version`：Prisma/@prisma-client 6.19.3，Node 22.17.1，darwin-arm64。
- `pnpm --filter @airoaming/server prisma:validate`：当前未修改 schema 仍有效。
- 当前真实 workspace 本轮仅只读列路径/键/计数；没有读取或输出 key，没有写入项目/设置。
- 三份新文档的路径、链接、frontmatter、代码围栏和状态已自检；上位文档、索引、会话记忆和长期记忆已同步。
- `git diff --check`、本地 Markdown 链接检查和 44 模型清单核对通过；最终静态复核未发现阻断项。

## Handoff

- G1 文档阶段已完成；用户随后继续 G2，按逐阶段确认口径，三份开发级文档为 `accepted`，实现未开始。
- Scrutiny Review 已通过；Runtime/User Review 本轮不适用，未来实施时必须按 G1 验收清单执行。
