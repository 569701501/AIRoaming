---
doc_id: AIR-D2-A8-PLAN-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2 至 M6 总 Handoff、D2-A7 验收和 D2-WIT 测试矩阵
---

# D2-A8 双 Fresh / Replay 综合见证

## 目标

在两个独立临时 SQLite、workspace、dataRoot 和 fake SecretStore 根中，使用正式 final importer、verifier 和 DB runtime 证明 DB-only 迁移语义稳定，然后允许进入 M6 tooling。

## 见证内容

- 两个 fresh target 使用同一个 sealed snapshot/decisions，final report、规范化 entity inventory、Asset sha256/bytes 一致。
- 同一 target replay 零新增，final report digest 不变。
- Nest restart 后公开 Workbench DTO、Dialogue、Task、Asset、Layout、Export 语义仍可读。
- 旧 metadata 移走后 DB API 不变；DB Working Copy 写入不重建旧文件。
- verifier、secret sentinel 和 capability gate 均保持通过。

## 非目标

- 不执行真实 workspace/DB/Keychain/provider、真实停写或 activate。
- 不改 schema/migration，不把见证 fixture 写入仓库。

## 退出标准

- D2-WIT-01/02/03/04/05 全部通过。
- server 全量、typecheck、web build、Prisma/G1、diff check 通过。
- Scrutiny/Runtime Review 通过，独立提交后状态为 `d2_passed`。
