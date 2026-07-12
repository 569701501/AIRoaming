---
doc_id: AIR-G3-M3-A6-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: G1 旧数据映射、G2 版本来源契约、M3-A5 handoff
---

# 目标

在 Story current 已确认的基础上，把 `storyboard.json` 导入为 StoryboardVersion，并建立稳定 Shot 与 StoryboardShotProjection。

# 非目标

- 不导入 Character、Asset/Visual、Candidate/Lock、Preflight、Layout、Export 或 Dialogue。
- 不解析未知角色 token；存在未迁移角色时 fail-closed，不写悬空 FK。
- 不实现 `db-verify`、final import、backup、activate 或 workspace 写回。

# 实施阶段

- [x] 读取 sealed snapshot、decisions 和 current StoryVersion。
- [x] 规范化 legacy storyboard 为 StoryboardDocumentV2，稳定重键 Shot。
- [x] 按 pending → Shot → projection → confirmed → current 顺序写入。
- [x] 接入 `db:import --kind shadow --slice storyboard` 与 replay/source 冲突检查。
- [x] 覆盖真实 SQLite confirmed/current/replay 链路。
- [x] 完成全量测试、门禁、静态复核和交接。

# 退出标准

A6 集成链路通过；Storyboard source 必须来自 current confirmed StoryVersion；StoryboardVersion、Shot、Projection 的 source/payload digest 可追溯；角色、素材和 Preflight 明确留给后续切片。
