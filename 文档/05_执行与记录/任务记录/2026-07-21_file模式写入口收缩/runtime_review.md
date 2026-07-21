---
doc_id: AIR-TASK-20260721-FILE-MODE-CLEANUP-RUNTIME
status: passed_isolated
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, qa
source: fresh SQLite 与隔离运行验证
---

# Runtime / User Review

## 结论

`passed_isolated`。未触碰 `~/.airoaming` 正式数据库、workspace、Keychain 或真实 Provider。

## 运行证据

- fresh SQLite 成功部署完整 0001～0017：53 张业务表、242 个有效 trigger、161 个非自动索引。
- M6 真实隔离 C0～C7：真实 final importer、pre-cutover backup、verify/materialize restore、Nest API read、activate、首笔业务写与回滚用例 2/2 通过。
- Project DB-only 创建、Working Copy、发布、重启恢复与旧 workspace 隔离定向 2/2 通过；全量对应 spec 42/42 通过。
- 正式 cutover runner 的两条 fresh domain chain、证据恢复与首写 file guard 在全量回归中通过。

## 用户路径判断

- 删除的 project reset 从无标准 DB 页面入口，DB service 原本只会返回退役错误，因此标准用户路径无可见变化。
- 逐章 Working Copy clear/publish、新项目/章节、双路线导入仍是当前可用替代路径。

## 已知测试现象

- 全量并发时 `RST-02` 用例耗时超过固定 5 秒而超时；隔离复跑耗时 4.395 秒并通过。判定为既有资源竞争型测试稳定性债，不是本轮回归。
