---
doc_id: AIR-G3-M3-A10-FINDINGS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: A10 代码探索与 SQLite 集成证据
---

# 发现与取舍

- 旧 `preflight.json` 只有 ID、版本或时间字段，不能证明生成输入；该类记录只创建 `PREFLIGHT_SOURCE_UNRESOLVED` open issue，不创建 `PreflightRevision`。
- Storyboard 的 `documentDigest` 是 Preflight 来源的权威绑定；仅相同 storyboard ID 不足以证明内容未变，故 digest 不匹配直接阻断。
- 资产引用先查目标稳定 ID，再按 legacy sourceKey 映射，避免旧资产 ID 恰好带 `asset_` 前缀时被误当成目标 ID。
- ChapterScene 通过当前 Chapter 范围内的 `sceneKey`/目标 ID 解析，不依赖旧 sourceKey 形状；视觉三元组必须同时满足 ready Asset、sha256 和 available Visual。
- A10 只恢复 PreflightRevision，不宣称完整迁移；Candidate/Lock、Task、Layout/Export、Dialogue 和切换闭环仍需后续切片。
