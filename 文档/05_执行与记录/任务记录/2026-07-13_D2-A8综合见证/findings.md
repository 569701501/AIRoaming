---
doc_id: AIR-D2-A8-FINDINGS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-WIT-01/02/03/04/05
---

# D2-A8 发现

- 两个目标必须复用同一个 sealed snapshot 才能证明“同一输入、不同目标根”的确定性；若重新生成 snapshot，runtime bundle 时间戳会改变 source identity，不应误判为 importer 不稳定。
- `readFreshInventory` 忽略 volatile 时间字段和随机 source/issue id，能比较 DB-only 规范化语义；Asset bytes/hash 另做逐项比较。
- replay 必须在目标 workspace 已非空、PersistenceState 已存在时仍先命中同 identity terminal run；这证明 replay 不依赖重新清空目标。
- 旧 metadata rename 后，DB Workbench 与 file fixture 规范化语义一致；后续 DB Working Copy 写入只改变数据库，不回写 archive。

## 留存边界

D2-A8 证明 D2 final/ready 的隔离见证，不证明 M6 activate、rollback 或真实 cutover。下一阶段为 M6 tooling 与隔离 C0～C7。
