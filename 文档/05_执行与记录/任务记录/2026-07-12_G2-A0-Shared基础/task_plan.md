---
doc_id: AIR-TASK-G2-A0-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2 五份施工资料、G2 版本来源与 Freshness 契约字典
---

# G2-A0 Shared 基础任务计划

## 目标

在不触碰数据库和服务端写路径的前提下，完成 G2 版本链的 Shared 基础：JCS/digest、四类 strict codec、SourceSnapshot、Stable Shot ID、Freshness/ProductionState 纯逻辑。

## 阶段

1. 读取契约和当前 Shared，冻结实现边界。
2. 实现 canonical JSON、strict JSON parser、SHA-256 和四类 codec。
3. 实现 SourceSnapshot、Stable Shot ID、Freshness/ProductionState。
4. 补充 Shared 单元测试和 golden fixture。
5. typecheck、unit test、静态复核和 handoff。

## 允许修改

- `packages/shared/src/index.ts`
- `packages/shared/src/versioning/**`
- 本任务目录和会话记忆、长期记忆

## 明确不做

- Prisma schema/migration、Repository、Controller、worker、任务表、真实文件迁移、前端 UI。
- 在 Shared 引入 Node `crypto`、Prisma、Nest 或文件系统。

## 退出标准

- G2-A0 Shared typecheck 通过。
- canonical JSON Unicode/数字/对象键/数组顺序测试通过。
- 四类 codec 的有效样例、排除字段、unknown/missing/null 负例通过。
- Freshness current/pending/historical/stale/missing/source mismatch 表驱动测试通过。
- Stable Shot ID 相同输入稳定，任一 scope/pending/request 改变即不同。
- Scrutiny Review 结论写入 findings；Runtime/User Review 对纯 Shared 逻辑标明不适用。

## 角色边界

- Worker：当前主代理，仅实现本切片并保留证据。
- Scrutiny Review：只读检查契约、类型、测试和 diff。
- Runtime/User Review：本切片无页面、任务状态或导出物，记录 N/A。

## 完成结论

G2-A0 Shared 纯逻辑已完成；A1 及后续切片仍按施工依赖顺序执行。
