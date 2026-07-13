---
doc_id: AIR-D2-A1-2-PLAN-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1 gap review、G1 SecretStore 契约、D2/M6 路线
---

# D2-A1-2 验收收口计划

## 目标

把 D2-A1 基础安全切片收口到正式退出门：macOS Keychain adapter、settings 原子脱敏、全链路 credential sentinel 证据和 capability registry 证据闭合。

## 非目标

- 不实现 D2-A2 Project/Chapter/Script 公开 DB 写。
- 不实现 D2-A6 Outbox consumer、project delete purge。
- 不实现 final importer、D3、M6 或任何真实切换。
- 测试不得访问真实 Keychain、真实 workspace、真实数据库或真实 provider。

## 阶段

| 阶段 | 状态 | 退出条件 |
| --- | --- | --- |
| 施工资料与边界 | completed | 五份资料已复核，adapter/atomic/sentinel/registry 边界明确 |
| macOS Keychain adapter | completed | 注入 fake executor 测试覆盖 put/get/delete/probe，生产路径仅 macOS 选择 |
| settings 原子迁移 | completed | temp→fsync→rename，write/fsync/rename 失败旧文件字节不变 |
| sentinel/redactor | completed | DB/settings/report/log/task/artifact/export fixture 均命中可检测，干净 fixture=0 |
| capability 与回归 | completed | settings capability 有证据并从 blockedIds 移除；全量门禁通过 |
| 双复核与提交 | completed | Scrutiny/Runtime Review 已通过，独立 commit 后停止在 A1-2 |

## 退出标准

1. `settings_credential_secret_store` 为 implemented、restartCovered=true、有稳定 evidenceTestIds。
2. `db:capabilities --check` 的 blockedIds 从 7 变为 6，其他 capability 状态不变。
3. A1-2 定向测试、server 全量测试、typecheck、Prisma validate、G1 三项和 diff check 全绿。
4. 真实平台凭据和真实数据仍未触碰。
