---
doc_id: AIR-G3-M3-A15-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A15 代码探索与 SQLite 集成证据
---

# 发现与取舍

- runtime bundle 不是 source manifest payload，必须独立用 `RuntimeBundleFileService` 校验文件 digest，并与 sealed.runtimeBundleDigest 对齐。
- 对话 runtime session 的 G1 trigger 禁止直接插入 closed；导入先写 active，再在同一事务切到 closed，保留“旧 session 不可继续运行”的语义。
- legacy assistant running 消息不是可恢复的 runtime lease；导入统一转为 failed，避免切换后出现永久 running。
- `pendingDialogueState` 仍由 M0 明确标为不可观察；A15 不凭空生成 PendingDialogueArtifact，下一切片需先接入各子 service 的 pending codec/capture。
