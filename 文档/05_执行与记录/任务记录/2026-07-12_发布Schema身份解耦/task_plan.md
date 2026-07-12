---
doc_id: AIR-TASK-20260712-RELEASE-SCHEMA-PLAN
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: ADR-0015 与用户执行授权
---

# 任务计划：发布 Schema 身份解耦

## 目标

在不改变现有数据库物理结构和 Luna M4 主体成果的前提下，建立独立 release Schema identity、收窄 G1 package closure，并同步架构/施工文档。

## 非目标

- 不运行真实 workspace、正式 DB 或 DB-only activate。
- 不新增 0011，不删表、不删 trigger。
- 不完成 backup/restore、final import 或 capability gate。

## 当前阶段

已完成。

## 阶段列表

### 阶段 1：事实与并行改动审计
- [x] 读取 G3-M 五份施工资料与 G1/G3 身份契约。
- [x] 检查 Luna 提交和未提交 M4 verifier 改动。
- [x] 建立 ADR-0015。
- **状态：** completed

### 阶段 2：release identity TDD
- [x] RED：当前发布身份精确包含 0001～0010。
- [x] GREEN：实现小接口 release Schema identity loader。
- [x] RED/GREEN：package script 不影响身份；新增有序 migration 自动进入 identity 并改变 digest。
- **状态：** completed

### 阶段 3：接入 Luna verifier 与收窄 closure
- [x] 保留 Luna CLI/Service/测试，替换 effective identity 来源。
- [x] 修正 verifier 对复合来源摘要和只读账本断言的误判。
- [x] 从 G1 manifest source closure 移除完整 package.json。
- [x] 复用独立 `schema-contract.spec.ts` 锁定 Prisma 6.19.3，并重新生成 manifest。
- [x] 证明 Schema/migration SQL 字节不变（trigger 位于既有 SQL 内，随之不变）。
- **状态：** completed

### 阶段 4：文档同步与冲突修复
- [x] 更新 `核心数据模型` 的 0001～0010/runtime identity 事实。
- [x] 更新 G3-M Luna handoff 到 A11C/M4 当前状态和真实 commit。
- [x] 更新 README、AI 上下文入口和 ADR-0015。
- [x] 更新记忆、任务终态和功能完成记录。
- **状态：** completed

### 阶段 5：Scrutiny Review 与验证
- [x] 定向测试、typecheck、server 全测、G1 三项、Prisma validate、diff check。
- [x] 只读复核不变量、Luna 改动保留和文档一致性。
- [x] Runtime/User Review 记录不适用原因。
- **状态：** completed

### 阶段 6：提交与交付
- [x] 只提交本任务文件和已整合的 Luna M4 草稿，不提交无关截图删除。
- [x] 输出 Handoff 与完成记录。
- [x] 创建 scoped commit。
- **状态：** completed

## 关键决策

| Decision | Rationale |
| --- | --- |
| release identity 只绑定 Prisma Schema + 自动枚举的按序 migration checksum | 反映物理/ORM结构，不再次绑定工具源码，也不遗漏未来 migration |
| overlay contract 独立验证，不把 TS 源 digest 放入 identity | 避免工具代码改变发布身份 |
| 保留 Luna 未提交 verifier 实现并在其上接线 | 避免并行工作丢失 |
| G1 generator 只冻结，不在本轮删除 | cutover 尚未完成，需要历史复现能力 |

## 阻塞项

无。真实 activate 仍由 G3-M D2/D3 和用户单独授权阻塞，但不影响本任务。

## 注意事项

- 工作树中的截图删除属于用户既有改动，不触碰、不提交。
- 每轮修改前检查 Luna 文件 mtime/diff，若出现并发新写入立即停止冲突文件编辑。
