---
doc_id: AIR-D2-A1-PLAN-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1 handoff
---

# D2-A1 任务计划

## 目标

让设置与凭据进入可验证的安全边界：图片 key 不再进入普通 JSON/DB/API，文本 key 归 OpenCode，metadata 可在 DB/file 模式读取。

## 阶段

| 阶段 | 状态 | 退出条件 |
| --- | --- | --- |
| 代码/契约探索 | completed | Settings、provider、Prisma metadata、D74/SecretStore 规则已定位 |
| 施工资料 | completed | 五份资料完成并静态复核 |
| SecretStore/fake adapter | completed | SEC-01～04、11 定向测试通过 |
| Settings metadata/迁移 | completed | SEC-05～08 定向测试通过，DB 重启证据已补齐 |
| provider/安全回归 | completed | SEC-09 定向测试、服务端/前端类型、全量回归通过；SEC-10 本切片无任务/产物写入，记为 N/A |
| 提交与 handoff | completed | Scrutiny/Runtime Review 留痕，A1 独立 commit |

## 禁止越界

- 不实现真实平台凭据库 adapter。
- 不把 SecretStore 删除 Outbox 当成已完成；D2-A6 负责 consumer。
- 不实现项目/章节/剧本 DB 公共写路径。
