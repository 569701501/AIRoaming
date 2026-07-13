---
doc_id: AIR-G3-M5-DOC-SCRUTINY-001
status: superseded
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M5 task package and current code exploration
---

# M5 文档静态复核

## 复核结论

`failed_reopened`。A0～A3 有独立提交且未修改 Schema/migration/trigger，但原复核把服务分支存在和少量 happy-path 测试误判成完整 BAK/RST 故障矩阵；2026-07-13 独立复核已转入 M5-A4。

## 已确认

| 检查项 | 结论 |
| --- | --- |
| M4 是否已完成并与 M5 解耦 | 是；M4 completed，M5 不重做 importer/verifier |
| A0～A3 是否可独立提交 | 是；每片有独立文件边界和退出测试 |
| 是否允许临时 backup 但阻止 production | 是；coordinated 可开发，pre-cutover/final/activate fail-closed |
| capability 是否可能被手填冒充完成 | 已设 CAP-02 和公开路径证据约束 |
| coordinated backup 是否可能把单个 run 冒充全量成功 | artifact 入口会校验 16 slice，但 DB 读取早于写入栅栏，副本与 manifest 的同时刻身份尚未证明 |
| backup 是否有 offline 证明 | 否；checkpoint/BEGIN IMMEDIATE 只包 DB copy，且 active writer/WAL 故障注入未执行 |
| restore 空根/原子语义是否明确 | partial；目标不存在与每根 rename 已实现，但 marker 不足以证明补偿删除时目录未被外部修改 |
| SecretStore 边界是否清楚 | 是；M5 不访问真实 SecretStore，D2/M6 继续阻塞 |
| Schema/migration 是否保持冻结 | 是；明确禁止修改 |

## 残留风险

- 本复核不把临时根演练等同于 production cutover；M6 仍需独立审查。
- full-shadow artifact 当前没有独立公开 codec；A1 必须以既有 `FullShadowImporter` canonical digest 规则和 `FULL_SHADOW_SLICE_ORDER` 为唯一标准实现严格校验，不得放宽键或顺序。
- Node SQLite 排他锁与 checkpoint 的最终实现需由 BAK-02 故障注入证明；若无法证明，应停止 A1。
- M5 完成后仍需独立 D2 capability/SecretStore/final importer 审查，不能直接领取 M6。
- A3 曾复核 server 49 files/314 tests、workspace typecheck、G1 manifest/schema/migration、Prisma validate 与 diff check；这些回归通过不等于 M5 专项清单全绿，Runtime/User Review 结论已由 A4 任务替代。
