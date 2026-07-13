---
doc_id: AIR-D2-A0-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A0 代码探索与验证
---

# D2-A0 发现与结论

## 已确认事实

1. 聚合 registry 原本只能回答“模块内部是否有部分 DB 读写”，不能回答公开 Service 门禁是否已经闭环。
2. 源码有 36 个门禁操作；其中 35 个没有 DB 公开写证据，不能沿用聚合项的内部 repository 证据。
3. `generation_task_create` 在 DB 模式不抛出旧门禁错误，而是进入 `PersistentG2TaskCreateGuardService`；现有集成测试覆盖其 task guard 路径，因此保留 implemented。
4. `dialogue_pending_runtime` 与 `settings_credential_secret_store` 当前没有 `assertDatabaseOperationSupported()` 调用点，但聚合能力仍是 required unsupported；A0 不能因为“没有门禁”把它们视为完成。

## 设计结论

- 操作级读状态使用 `not_applicable`，避免为写门禁虚构读证据。
- 聚合 blocked 计算同时检查操作状态；任何新增门禁若未登记，源码覆盖测试会失败。
- D2-A0 只建立真实盘点和门禁，不把未实现业务提前写成 partial/implemented。

## 残留风险

- 后续 D2-A1～A6 完成业务后，需要逐项新增公开 API、重启、隔离和证据测试，再更新对应操作状态。
- 当前操作来源依赖静态源码扫描正则；若门禁改成动态字符串或间接 helper，必须在后续变更中扩展扫描规则并保持显式登记。
