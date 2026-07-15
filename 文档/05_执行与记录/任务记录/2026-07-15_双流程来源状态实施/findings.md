---
doc_id: AIR-TASK-20260715-SCRIPT-SOURCE-STATE-FINDINGS
status: completed
created: 2026-07-15
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 探索发现

## 当前实现

- `ProjectScriptOutline`、`ChapterScriptVersion` 已版本化；`ChapterScriptPending` 每章最多一个，但没有待确认稿类型和来源集合。
- 生产状态当前只暴露 `hasAiPending` / `SCRIPT_AI_PENDING`，实际数据库 pending 不区分来源。
- `PendingDialogueArtifact` 适合灵感/大纲等对话候选，不适合保存不可变原稿、确认目录和长期批次状态。
- 旧导入工具已经在 DB-only 路径禁用；新导入必须走非破坏性 pending/确认链，不得复活整稿覆盖。
- 项目物理删除是显式表顺序清理；新来源表需要纳入同一协调删除窗口。

## 数据库与迁移

- 0001～0010 已冻结；0011 之后直接维护 `schema.prisma`、前向 migration、小型契约和运行时 migration catalog。
- 当前运行时 ledger 精确到 0016；本任务需要新增组合 ledger，而不是修改历史 G5 ledger 的既有语义。
- G1 migration plan 维护 post-G1 overlay 白名单；0017 必须显式加入，否则迁移资产检查会失败。

## 关键取舍

- 已确认拆章目录以一个不可变 JSON 产物保存，批次项只保存稳定 `mapItemRef` 和来源范围摘要；不再建立一套可编辑章节计划表。
- 原稿拆成不可变 Version / Document / Block 三层；Block ref 在该原稿版本内稳定，供 package 1 严格 parser 校验。
- pending 来源集合先写入绑定行，再一次性密封 canonical projection 与摘要；密封后禁止修改身份或来源。
- 现有 pending 回填为 `legacy`，避免迁移时伪造其历史来源；新工作流只能产生密封的 `ai` 或 `import` pending。

# 风险

- 本包完成后生产 Prompt 和页面仍不会自动使用新链路，必须由后续包显式接线。
- 目录 JSON 仍需通过 Shared parser 重建校验；仓储不能把任意 JSON 当作已确认目录。
- 来源密封只能证明“输入了哪些精确版本”，不能替代 P1～P5 的语义质量评测。

# 实施结论

- `0017_script_dual_flow_source_state` 以前向 overlay 新增 9 张表，并原位扩展 `chapter_script_pending`；旧 G1 基线和既有 pending 触发器保留。
- 新 AI pending 使用 `ai-chapter-generate/1.0`，强制绑定当前已确认大纲、目标章节卡和第 2 章起的前章正式版本；目标章非空时阻断。
- 新 import pending 使用 `import-chapter-materialize/1.0`，强制绑定原稿、分析、确认目录、目录项、批次项和忠实度报告；通用采用/丢弃接口拒绝该类型。
- 导入确认以单事务创建 `origin=import` 的正式 `ChapterScriptVersion`，推进章节与批次项，不经过 Working Copy。
- 确认目录启动批次时只复用目录内空白章节，更新默认章标题并拒绝目录外多余章节；随后一次建立全部章节项。
- 任意 pending 都阻断 StoryStructure；导入类型使用 `SCRIPT_IMPORT_PENDING`，现有正文和 StoryStructure payload 不变。
- 项目协调删除已按外键顺序清理新增来源链，并通过含真实导入来源数据的集成复核。

# 复核结论

- Scrutiny Review：`passed`。
- Runtime/Repository Review：`passed_db_isolated`。
- 残留风险只在后续接线范围：生产 Prompt、对话工具、批次 worker 和页面尚未调用本能力；不能把本包描述为完整用户流程已上线。
