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
- `pendingDialogueState` 现在由 `dialogue_pending_state_v1` 显式封口；只捕获 ScriptDialogueService 实际持有的三个 Map，StoryStructure/Storyboard 仍由各自领域表/文件承载，避免重复真值。
- PendingDialogueArtifact 的 target ID、activeSlotKey、payloadDigest 均由稳定 legacy source key 派生；runtime-bundle digest 作为统一 source evidence，重复导入只更新 ImportedEntitySource 的 lastRun，不新增业务行。
