---
doc_id: AIR-D2-A0-REVIEW-001
status: ready_for_review
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa, reviewer
source: D2-A0 测试矩阵与实施契约
---

# D2-A0 复核清单

## Scrutiny Review（静态）

- [x] 只修改 D2-A0 允许的代码和文档文件，没有 SecretStore/业务 Repository/真实激活改动。
- [x] 8 个聚合 capability 的 ID、owner、聚合状态和 blocker 没有被静默改绿。
- [x] 操作 registry 的 36 个操作与真实源码扫描完全相等，无漏项、重复项或幽灵项。
- [x] 每个操作都有 capability、owner、sourceFile、sourceSymbol、readStatus、writeStatus、evidenceTestIds。
- [x] 所有门禁操作的 `readStatus=not_applicable`，没有把写入口误报为读能力。
- [x] 只有 `generation_task_create` 标记 implemented，且证据确实经过 DB guard；file-mode 测试没有被当成 DB 证据。
- [x] `getBlockedDbCapabilities` 会检查操作级状态和证据。
- [x] getter 返回副本；registry getter 的现有 clone 语义保持不变，operation getter 使用同样的深拷贝实现。
- [x] CLI 输出稳定 JSON，不初始化 Prisma；`--check` 仍返回 2。
- [x] `git diff --check`、typecheck、targeted test 全部通过。

## Runtime/User Review（运行）

- [x] 使用临时环境运行 CLI report/check，没有访问默认 workspace 或真实数据库。
- [x] report 包含 8/36 两层清单。
- [x] check 的 `blockedIds` 仍包含 project、outline、character、layout、dialogue、settings、delete 七项。
- [x] check 不包含 task capability（其聚合与操作均有现有证据）。
- [x] 未运行 `db:activate --execute`、真实 final/pre-cutover 或任何真实停写流程。

## 复核结论模板

```text
结论：passed_for_d2_a0 / changes_requested
静态证据：<命令与结果>
运行证据：<CLI report/check 与退出码>
残留风险：<仅记录 D2-A1 以后问题，不在本切片修复>
下一步：通过后领取 D2-A1；未通过则只修 D2-A0。
```
