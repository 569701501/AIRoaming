---
doc_id: AIR-TASK-20260712-G3-READINESS-HANDOFF
status: complete
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G3 文档开发就绪度审查
---

# G3 交给 Luna 前的交接说明

## 当前状态

- 产品决策有效：漫画版式为创建时必选的 `vertical_scroll/paged_comic`，创建后不可直接修改。
- G3 功能尚未实现。
- 当前三份正式文档不能直接作为完整施工包，静态复核结论为不通过。

## 暂时不要让 Luna 决定的事项

1. 旧 file 项目在 importer 尚不存在时如何读取和升级。
2. G3 trigger 应修改旧 migration 还是新增 `0010`。
3. G1/G2/G3 migration ledger 与 `PrismaService` 启动 guard 如何继承。
4. 候选尺寸 `policyVersion` 放在哪个对象、是否进入 digest 和是否升级 schemaVersion。
5. DB mode 是否在 G3 扩展普通项目 metadata PATCH。
6. Web 创建字段错误继续复用全局 error，还是采用独立 modal 状态。

这些都属于项目架构或契约决策，不属于实现者自由发挥范围。

## 补档后的 Luna 阅读顺序

1. `ADR-0009_项目创建时锁定漫画版式.md`
2. `2026-07-11_G3漫画版式入口与不可变约束开发方案.md`
3. `2026-07-11_G3漫画版式契约与旧值迁移字典.md`
4. 新增的五份 G3 施工包
5. `G3漫画版式入口与锁定验收清单.md`
6. 本审查目录中的 `scrutiny_review.md`

## 建议施工顺序

```text
前提裁决
  -> Shared canonical/strict parser
  -> 0010 overlay + inspection + ledger/startup guard
  -> file/DB repository 与旧值兼容边界
  -> Create/PATCH API 事务与错误映射
  -> 现有创建弹窗、专用错误状态、只读标签
  -> G2 SourceSnapshot/持久任务/candidate/layout 适配
  -> 自动化测试、重启、旧项目演练
  -> Scrutiny Review
  -> Runtime/User Review
```

## Luna 开工门

只有以下条件同时满足才可交付完整 G3：

- 五份施工资料已补齐并与当前代码逐文件对照。
- file mode/旧项目策略已由项目方裁决。
- `0010` 与 ledger/startup guard 方案已冻结。
- mandatory 验收项都有当前仓库可执行的 spec、fixture 和证据来源。
- 新一轮 Scrutiny Review 结论为通过。

在此之前，如果把资料交给 Luna，应明确要求其只做阅读和问题反馈，不提交完整实现。
