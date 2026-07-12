---
doc_id: AIR-G3-M3-A5-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: G1 旧数据映射、G2 版本来源契约、M3-A4 handoff
---

# 目标

在 A2 Project/Chapter 和 A3 ScriptVersion shadow 基础上，把 `structure.json` 导入为 StoryVersion，并重建 ChapterScene、StorySceneProjection、StoryBeatProjection。

# 非目标

- 不导入 Storyboard/Shot、Preflight、Character/Asset、Candidate、Layout、Export 或 Dialogue。
- 不把缺失/非当前 Script source 猜成 current；来源不足只记录 `STORY_SOURCE_UNRESOLVED` blocker。
- 不实现 `db-verify`、final import、backup、activate 或 workspace 写回。

# 实施阶段

- [x] 读取 sealed snapshot、decisions 与现有 A2/A3 target。
- [x] 规范化 legacy structure 为 StoryDocumentV2，计算 document/source/payload digest。
- [x] 以 pending→projection→confirmed 顺序满足 G1/G2 SQLite trigger，恢复 current 指针。
- [x] 加入 `db:import --kind shadow --slice story` 与稳定 ID/replay 冲突检查。
- [x] 覆盖 source resolved、projection、同库 replay 与 source unresolved blocker。
- [x] 完成 typecheck、定向/全量测试、G1 门禁、静态复核和交接。

# 退出标准

A5 集成测试 2 项通过；StoryVersion 仅在 source 可证明且 current Script clean 时 confirmed/current；来源不足不插入伪 confirmed 版本并写 blocker；server 全量测试、typecheck、G1 三项检查和 diff check 通过。Storyboard/Shot 仍留给下一切片。
