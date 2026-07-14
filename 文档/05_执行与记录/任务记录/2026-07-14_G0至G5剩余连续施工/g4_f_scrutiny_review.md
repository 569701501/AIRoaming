---
doc_id: AIR-G4-F-SCRUTINY-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, reviewer
source: G4-A～F 实现、正式验收清单、完整回归与运行证据
---

# G4-F 暨 G4 总体静态复核

## 1. 结论

```text
phase = G4-F
result = passed
overall_g4 = G4_PASSED
implementation_commit = 81c922a
next = G5_M0_IN_PROGRESS
```

未发现阻塞 G4 关闭或 G5 接入的 Schema、迁移、事务、来源 freshness、备份恢复或 Web 权威路径问题。

## 2. 复核范围

- 0012 overlay 保持 CandidateLockRevision 只追加线性历史，Shot current pointer 只在同事务内推进；A→B→clear→A 不复用旧 revision。
- preview/commit 使用 expected current revision 与 impact digest 双重 CAS；丢响应只允许精确 current replay，并发 writer 不会产生分叉。
- favorite、reject/restore 与 current final 分离；新 Candidate 不会改变 current lock set、Layout 或 Export freshness。
- Layout Working Copy、正式 Layout、Export 与运行中任务都保存候选来源；replace/clear 后旧产物保留，新正式写入 fail-closed。
- legacy importer 只依据 storyboard 的直接 `lockedCandidateId` 证据恢复 v1；缺失 Candidate、Asset 未 ready、作用域错误或 runtime current 冲突分别给出稳定 blocker，绝不猜“最新候选”。
- DB-only 协调备份/恢复保留 revision 链、Shot pointer、Candidate/Asset 与重算 lock-set digest，两个 Asset 字节逐一一致。
- 设置密钥重复保存改为幂等；缺少受控旧密钥清理事件时，轮换在覆盖 SecretStore 和运行内存前提前拒绝，避免重复 E2E 暴露的元数据不一致。
- G4 没有提前实现 G5 的自由画布、crop、富文本或 renderer；旧排版仅显示来源已变化并阻止新导出。

## 3. 静态与自动化证据

- Server 完整回归两次：80 files、535/535 tests，通过。
- Shared 完整回归：10 files、54/54 tests，通过。
- G4 纯规则/overlay/source gate 定向：8 files、36/36 tests，通过。
- legacy/full/final importer：78/78 tests，通过。
- DB-only 持久化 P6/G4-D：1/1；OBS-07 备份恢复：1/1。
- Server、E2E typecheck、Prisma validate、全仓 production build、E2E 环境 31/31 与 `git diff --check` 全部通过。
- DB-only Playwright `--repeat-each=3`：3/3，通过。

## 4. 剩余边界

- G4 的性能画像建议项 NFR-01/02 未单独执行 100 Shot 压测和 `EXPLAIN QUERY PLAN`；Schema 已有对应索引，当前正确性/一致性门均通过。这两项登记为后续性能证据，不阻塞 G4 功能关闭。
- G5 才负责实际换图、裁切、编辑、确定性 PNG/PDF/条漫与出版 manifest；不得把 `G4_PASSED` 解读为 G5 已完成。
- backup/archive 保留；未执行 down migration、file-only 回退、G6 或视频链路。
