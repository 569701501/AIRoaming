---
doc_id: AIR-TASK-G2-A0-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2-A0 契约和代码探索
---

# findings

## 需求与边界

- G2-A0 的正式退出条件是 Shared 层可验证，不包含数据库或真实用户路径。
- V2 Story/Storyboard/Preflight DTO 的 exact-key 规则是运行时不变量，TypeScript interface 不足以替代校验。

## 代码事实

- `packages/shared` 当前没有 Node 运行时依赖，构建目标同时服务 web/server，因此 hash 和 canonical JSON 必须保持平台无关。
- 现有 `StoryStructureJson`、`StoryboardJson`、`ImagePreflightJson` 是 V1 文件态 DTO，不能直接作为 V2 document digest 输入；V2 codec 需要显式排除旧元数据字段。

## 风险

- Freshness 的数据库行字段在 A0 只能用最小、可序列化的输入接口表达；A1/B/C/D 需要把 Prisma rows 映射到该接口并补集成证据。
- RFC 8785 对数字和 Unicode 的边界行为需要 golden 测试锁定；不能依赖 `JSON.stringify` 的对象键插入顺序。

## 复核

- Scrutiny Review：待实现后执行，只读检查静态契约、测试和 diff。
- Runtime/User Review：N/A；本切片无页面、任务、导出物或用户路径。

## 完成结论

- Shared G2-A0 已完成并通过 typecheck、Shared unit、Server regression 和静态 diff 检查。
- A0 的 resolver 输入是显式纯数据接口；数据库映射和写事务必须在后续切片实现，不能把 A0 输出直接当作持久化事实。
- 尝试按施工计划新增 `test:g2` package script 时，G1 manifest 将 `apps/server/package.json` 视为 source closure，导致 exact manifest 测试失败；脚本改动已撤回，G1 基线恢复并重新通过全量验证。
