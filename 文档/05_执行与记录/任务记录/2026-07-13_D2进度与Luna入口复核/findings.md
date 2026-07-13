---
doc_id: AIR-D2-PROGRESS-AUDIT-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 路线、代码、测试与 capability report 交叉复核
---

# D2 进度复核发现

## 已完成

1. G3-M foundation（M0～M4）与 M5 backup/restore 已完成。
2. D2-A0 已形成 8 个聚合 capability 和 36 个操作级门禁清单。
3. D2-A1 已有真实实现，不是纯文档：fake/unavailable SecretStore、SecretString、Settings DB metadata、file 脱敏、公共 DTO 与 9 项定向测试。

## A1 未闭合项

1. `settings_credential_secret_store` registry 仍是 read/write unsupported、restart=false、evidence=[]，blocker 文案也已过期；D2 capability 事实源未更新。
2. G1 要求 macOS Keychain 是当前平台必须通过项；当前 `SecretStoreService` 只选择 fake 或 unavailable，没有生产 adapter。
3. A1 实施契约要求 sanitized 临时文件 + rename，当前 file settings 仍直接 `writeFile` 覆盖目标，未证明中断/rename 失败时旧明文文件字节不变。
4. SEC-10 被记为 N/A，但 D2-A1 路线要求扫描 DB/settings/report/log/workspace；G1 还要求 task、异常、provider 响应和导出物递归脱敏。
5. DB replace/clear 的正式 Outbox 生命周期属于 D2-A6，可继续阻塞；A1-2 只能补齐可安全交给 A6 的 versioned ref/metadata 边界，不得越权实现 purge consumer。

## Scrutiny Review

结论：`changes_requested_before_d2_a2`。

D2-A1 基础实现质量可作为后续收口起点，但当前不满足正式退出门。下一份 Luna 任务必须是 `D2-A1-2 验收收口`，不得直接进入 D2-A2。

## Luna 下一任务最小退出门

- macOS Keychain adapter 通过可注入执行器的契约测试，测试不得触碰用户真实 Keychain。
- legacy settings 采用 temp→fsync→rename；store/写入/rename 任一失败时旧文件字节不变且无明文副本。
- SEC-01～11 均有明确 passed/not-applicable 依据；SEC-10 至少覆盖 DB、settings、migration report、日志、task/artifact/export fixture sentinel=0。
- `settings_credential_secret_store` 改为有证据的 implemented/restartCovered，capability CLI 的 blockedIds 从 7 降到 6；其余 capability 不得误改绿。
- 独立 commit，Scrutiny/Runtime Review 通过后停止，不领取 D2-A2。
