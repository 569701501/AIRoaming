---
doc_id: AIR-D2-A8-SCRUTINY-001
status: passed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A8 test matrix、D2-WIT spec、capability CLI
---

# D2-A8 Scrutiny Review

## 结论

`passed_for_d2`。

## 核对

- fresh A/B 不是两个各自生成的不同 snapshot，而是同一 sealed artifact 在两个独立目标根的重复导入，避免动态 runtime bundle 伪造差异。
- report digest、规范化 inventory、Asset hash/bytes、public DTO 均有直接断言。
- replay、restart、legacy isolation 和 DB-only mutation 均通过。
- capability 由真实 CLI 读取，`blockedIds=[]`；没有手改 registry 数字。
- 测试只使用临时根和 fake SecretStore，没有真实系统副作用。

结论：D2-A8 可以进入 M6；M6 仍需独立实现和隔离演练。
