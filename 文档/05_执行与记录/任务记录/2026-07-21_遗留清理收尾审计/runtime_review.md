---
doc_id: AIR-TASK-20260721-CLEANUP-CLOSEOUT-RUNTIME
status: passed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, qa
source: fresh SQLite、全量测试与 E2E 最小化诊断
---

# Runtime / User Review

## 结论

`passed`。清理相关的类型、构建、数据库、服务端全量与 file 用户路径均通过；初次 DB E2E 的 3 项非删除回归已修复测试设施并完整复跑 15/15。

## 隔离边界

- 未触碰 `~/.airoaming` 正式数据库、workspace、Keychain 或真实 Provider。
- fresh SQLite 与 E2E 都使用隔离临时目录和 loopback 假 provider。

## 运行证据

- fresh SQLite 完整部署 0001～0017：53 张业务表、242 个有效 trigger、0 个 view。
- workspace typecheck/build、E2E typecheck、Prisma validate 通过。
- Shared 167/167；Server 755/755；M6 真实隔离演练 2/2；关键 DB/trigger/outbox/G4/layout 集成均通过。
- file E2E 4/4，证明保留兼容分支仍可达且未被半删。
- E2E 环境 36/36、prepare 3/3、完整 DB E2E 15/15。

## DB E2E 诊断

| 现象 | 原始诊断 | 修复与结果 |
| --- | --- | --- |
| 候选图用例检测到历史图片请求 | 单跑 1/1 通过且无图片请求；整套读取累计历史 | 记录用例开始游标，只检查新增请求；前序图片组合 2/2、全矩阵通过 |
| W1-E2E-05 无“确认结构” | 单跑稳定失败；旧假 provider 只返回 Markdown JSON | `json_schema` 请求返回 `info.structured`；原失败组合与全矩阵通过 |
| Storyboard S2 无“确认结构” | 与上项同一合同不匹配，未进入分镜质量门 | 同一固定结构修复后正常进入质量门并通过 |

## 用户路径判断

- 被删除入口在标准 DB-only 页面、Controller、worker 和正式 CLI 中均不可达；现行 Working Copy、异步参考图、G4 候选决策和持久任务路径未改变。
- 修复只在 E2E 假 provider 与断言隔离层完成，没有改动生产 OpenCode、页面或数据库。
