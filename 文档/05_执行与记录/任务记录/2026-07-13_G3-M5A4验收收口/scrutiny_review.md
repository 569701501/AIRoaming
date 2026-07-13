---
doc_id: AIR-G3-M5-A4-SCRUTINY-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5-A4 文档包与当前代码只读复核
---

# M5-A4 文档静态复核

## 结论

`passed_for_luna_a4_1`。

本结论只表示 A4-1 任务书可执行，不表示 M5 实现通过。M5 仍为 `hardening_required`。

## 已确认

| 检查项 | 结论 |
| --- | --- |
| 是否给出具体代码证据而非泛称测试不足 | 是；M5R-01～08 已绑定生产行为 |
| 是否把修复拆成可独立提交的小片 | 是；A4-1～A4-4，当前只发 A4-1 |
| A4-1 是否限制在 backup consistency/CLI | 是 |
| 是否要求真实并发 writer 证据 | 是；不能用静态分支存在替代 |
| 是否越权进入 final/SecretStore/activate | 否，明确禁止 |
| 是否保留真实根与 SecretStore 安全边界 | 是，只允许临时根/fake store |
| 是否继续增加无业务价值的双签审查基础设施 | 否；要求生产修复和直接测试 |

## 下一次复核重点

1. 锁是否在所有 DB 派生读取之前取得，而不是只包住文件 copy。
2. 并发 writer 测试是否真正使用第二 SQLite 连接。
3. manifest/副本一致性是否由直查断言，而不是比较同一内存对象。
4. 参数失败是否真的发生在 Prisma 初始化前。
5. 是否只完成 A4-1 后停止。
