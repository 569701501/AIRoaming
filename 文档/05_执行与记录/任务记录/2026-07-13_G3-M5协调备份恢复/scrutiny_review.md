---
doc_id: AIR-G3-M5-DOC-SCRUTINY-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5 task package and current code exploration
---

# M5 文档静态复核

## 复核结论

`passed_for_development`。当前任务包已经具备 Luna 开发 M5-A0 所需的独立输入、允许/禁止边界、CLI 语义、数据结构、稳定错误、测试 ID、退出证据和 Stop condition。

## 已确认

| 检查项 | 结论 |
| --- | --- |
| M4 是否已完成并与 M5 解耦 | 是；M4 completed，M5 不重做 importer/verifier |
| A0～A3 是否可独立提交 | 是；每片有独立文件边界和退出测试 |
| 是否允许临时 backup 但阻止 production | 是；coordinated 可开发，pre-cutover/final/activate fail-closed |
| capability 是否可能被手填冒充完成 | 已设 CAP-02 和公开路径证据约束 |
| coordinated backup 是否可能把单个 run 冒充全量成功 | 否；必须校验 full-import report 的 16 个有序 succeeded slice、nested report/ledger 和统一 source/snapshot/decisions 身份 |
| backup 是否有 offline 证明 | 维护 bundle + checkpoint + 排他写阻断三者同时要求 |
| restore 空根/原子语义是否明确 | 是；目标必须不存在，每根 rename + marker 补偿，不声称跨根事务原子 |
| SecretStore 边界是否清楚 | 是；M5 不访问真实 SecretStore，D2/M6 继续阻塞 |
| Schema/migration 是否保持冻结 | 是；明确禁止修改 |

## 残留风险

- 本复核只证明文档可施工，不证明 M5 代码已实现。
- full-shadow artifact 当前没有独立公开 codec；A1 必须以既有 `FullShadowImporter` canonical digest 规则和 `FULL_SHADOW_SLICE_ORDER` 为唯一标准实现严格校验，不得放宽键或顺序。
- Node SQLite 排他锁与 checkpoint 的最终实现需由 BAK-02 故障注入证明；若无法证明，应停止 A1。
- M5 完成后仍需独立 D2 capability/SecretStore/final importer 审查，不能直接领取 M6。
