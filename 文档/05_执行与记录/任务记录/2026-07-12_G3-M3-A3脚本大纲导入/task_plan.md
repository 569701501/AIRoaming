---
doc_id: AIR-G3-M3-A3-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, luna
source: G3-M 导入器决议与迁移账本、G1 旧数据映射、G2 版本来源契约
---

# 目标

在已完成的 Project/Chapter shadow 基础上，导入项目级 `ProjectScriptOutline` 和章节不可变 `ChapterScriptVersion`，恢复 current 指针并记录来源账本。

# 非目标

- 不导入 ChapterScriptPending、ChapterScriptRevision、Story/Storyboard/Preflight 或后续实体。
- 不实现 `db-verify`、final import、backup、activate 或真实 workspace 写回。
- 不把缺失历史猜成 runtime task 或伪造 ScriptVersion 状态。

# 实施阶段

- [x] 读取 sealed snapshot 和已校验 decisions，定位已有 Project/Chapter target。
- [x] 导入 `script-outline.md/json` 为 version 1，Markdown 正文优先。
- [x] 导入 `script.versions/script-vNNN.md`，使用 `origin=import`、稳定 target ID 和内容 digest。
- [x] 恢复 Chapter currentScriptVersionId、working state 和 Project currentScriptOutlineId，遵守 rowVersion 触发器。
- [x] 提供 `db:import --kind shadow --slice script-outline`。
- [x] 全量测试、门禁、静态复核、交接和提交。

# 退出标准

通过 A3 集成测试：Outline/ScriptVersion 写入、current 指针、working copy clean、同库 replay 零新增；server 全量测试、typecheck、G1 三项检查和 diff check 通过；明确 pending/revision 与后续实体仍未实现。提交为 `6dac060`。
