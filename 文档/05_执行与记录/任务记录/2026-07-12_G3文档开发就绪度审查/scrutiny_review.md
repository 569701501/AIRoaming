---
doc_id: AIR-TASK-20260712-G3-READINESS-SCRUTINY
status: complete
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3 正式文档、当前 G1/G2 代码与迁移树静态复核
---

# G3 文档开发就绪度静态复核

## 结论

**不通过。当前不建议把“完整 G3 开发”直接交给 Luna。**

三份正式文档已经足以说明产品意图和领域约束，但没有封闭当前仓库上的迁移、兼容和阶段接线问题。Luna 能做局部新建项目切片，不能在不代替架构负责人做决策的前提下完成 G3 全部退出标准。

## 阻断理由

1. 验收文档声明 G1 importer、备份/恢复、DB-only 已完成；当前代码没有这些运行能力，默认仍是 file mode。
2. G3 禁止 runtime legacy fallback，但默认 file mode 仍依赖它读取旧项目；删除后可能让项目被跳过，保留又违反 G3 规则。
3. G3 trigger 未规定如何作为 `0010` 接入现有 migration artifact、ledger 和 Prisma 启动门禁；当前 guard 不接受任意新增迁移。
4. G2 已新增 canonical Preflight 与持久图片任务路径，原 G3 文件清单没有覆盖这些真实消费点。
5. 尺寸 policyVersion、Web 字段错误状态、DB PATCH 范围和部分验收证据来源仍需开发者猜测。

## 通过门槛

在重新申请施工复核前，至少补齐并接受以下五份施工资料：

1. `G3施工包_依赖边界与阶段门禁`：冻结阶段顺序、每阶段允许改动的文件、编译门和 stop condition。
2. `G3施工包_数据库Overlay与迁移账本`：冻结 `0010`、trigger、inspection、ledger 继承、Prisma 启动激活和回滚口径。
3. `G3施工包_文件兼容与旧值迁移`：裁决默认 file mode、旧项目读取、importer 依赖、决议/报告和删除门。
4. `G3施工包_API错误与Web状态契约`：冻结原始 body allowlist、DB/file PATCH 范围、错误 envelope、modal/store 状态与无障碍节点。
5. `G3施工包_下游适配与可执行证据`：冻结 SourceSnapshot、candidate、persistent task、layout adapter、policyVersion 字段，并把验收项映射到实际 spec/命令。

## 允许的临时范围

若必须马上开工，只能把任务明确标成“G3 fresh-project vertical slice”，范围限于 Shared 两值、创建 parser、新项目 DB/file 写入、现有弹窗必选字段和只读标签；不得删除旧项目兼容读取、不得宣称 G3 complete、不得实现或跳过未裁决的 importer/ledger 事项。

该临时范围仍需单独任务说明，不能直接使用现有完整 G3 退出标准。

## 复核职责

- 本文件是 Scrutiny Review，只评估文档与代码可追踪性。
- 本轮没有实现，不存在可执行的 Runtime/User Review。
- 通过门槛补齐后，应再次静态复核，再交给 Luna 施工。
