---
doc_id: AIR-TASK-20260712-G3-CONSTRUCTION-PACK-PLAN
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3 文档开发就绪度审查与用户继续补齐要求
---

# 目标

1. 把 G3 产品/领域设计转为基于当前 G1/G2 实现的逐文件施工包。
2. 封闭 file mode、旧值、`0010` migration、runtime ledger、API/Web 状态和 G2 下游适配的架构猜测空间。
3. 让 Luna 能按阶段独立实现，每阶段都有输入、允许改动面、验证命令、退出标准和 stop condition。

# 非目标

- 不实现 G3 业务代码、Prisma migration、页面或测试。
- 不建设完整 G1 maintenance importer、备份恢复和 DB-only activate。
- 不运行或改动真实 workspace、真实数据库和密钥。
- 不提前实现 G5 PageProfile、LayoutPreset 或最终出版布局。

# 强制验收标准

1. 五份施工资料均有 frontmatter、稳定标题、明确阶段和精确文件入口。
2. `0010` 名称、SQL 责任、inspection、ledger 继承、Prisma 启动 guard 和回滚口径固定。
3. file mode 旧项目处理不再静默默认，也不假装 importer 已存在。
4. API 原始 body、错误码、DB/file PATCH 边界、Web store/modal 状态固定。
5. SourceSnapshot、candidate spec、persistent image task、legacy layout adapter 的字段和版本策略固定。
6. 验收项区分当前 mandatory、rollout gate 和 importer-deferred，并映射到实际 spec/命令。
7. G3 主方案、契约字典、架构、模块、索引和长期记忆同步。
8. Scrutiny Review 通过；Runtime/User Review 因 docs-only 明确不适用。

# 阶段

## 阶段 1：事实复核与裁决

- 复核 G3 三份正式文档、G2 五份施工资料模板、当前 migration tree、repository、任务与 Web 调用面。
- 冻结四项裁决：file 兼容、`0010`/ledger、DB PATCH、sizePolicyVersion。

## 阶段 2：五份施工资料

- 依赖边界与阶段门禁。
- 数据库 Overlay 与迁移账本。
- file 兼容与旧值迁移。
- API 错误与 Web 状态契约。
- 下游适配与可执行证据。

## 阶段 3：事实源同步

- 更新 G3 主方案与契约字典的施工补充入口。
- 更新架构、模块、索引和 G3 验收清单。
- 更新会话记忆和长期记忆。

## 阶段 4：静态复核与交接

- 检查本地引用、frontmatter/doc_id、代码围栏、尾随空格和文档边界。
- 输出 `scrutiny_review.md` 与 `handoff.md`。

# 退出标准

- 五份资料与所有同步文档均通过静态检查。
- 所有审查 P0/P1 均有明确裁决、责任文件、阶段和测试。
- Handoff 能直接告诉 Luna 阅读顺序、任务顺序、禁止项和完成定义。

# 完成结论

- 五份资料与事实源同步已完成。
- Scrutiny Review：`passed`。
- Runtime/User Review：docs-only `not_applicable`，后续 G3-core 强制补做。
- Luna Handoff 已提供逐切片阅读/施工/停止/完成口径。
