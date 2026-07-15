---
doc_id: AIR-TASK-20260715-SCRIPT-CONTRACTS-FINDINGS
status: active
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 探索发现

## 当前实现

- `packages/shared/src/script-format.ts` 同时承载灵感数量、大纲格式、章节格式和 Prompt 片段；大纲尚无第四区块，章节合法性只判断标题和六个标签是否被文本包含。
- `apps/server/src/dialogue/dialogue-json.util.ts` 的灵感解析会对超过 3 个候选执行 `slice(0, 3)`，与新契约“恰好 3 个”不一致。
- `apps/server/src/dialogue/dialogue-text.util.ts` 的 `ensureChapterMarkdown()` / `ensureScriptOutlineMarkdown()` 会把非标准输出包装成旧格式，不能作为 B4 忠实导入门。
- 当前没有 `import-analysis/1.0`、`import-fidelity/1.0` 的共享类型和严格 parser。
- Shared 已有成熟的无运行时依赖纯函数测试方式，适合把新契约放入独立模块并从 `index.ts` 导出。

## 关键取舍

- 新增版本化严格 API，不直接改变旧兼容函数；后续实施包 3/4 再把动态 Prompt 和服务端写入门切到严格 API。
- parser 只验证 AI 应输出的语义字段，不要求数据库 ID、时间戳、current 指针或 `readyForNextStage`。
- Markdown parser 保留页面现有内容字段，但返回结构化章节卡/场景，便于后端绑定来源和做 round-trip 校验。

# 风险

- 本包通过不代表生产行为已经使用新契约；如果后续只更新 Skill 文档而未接动态 Prompt/后端门，旧兼容路径仍会放行非严格输出。
- B2 范围覆盖的数学校验依赖后续稳定 source block catalog；本包只能校验引用和区间形状，不能凭 JSON 单独证明原稿覆盖完整。
- B4 fidelity 的引用存在性和范围并集依赖调用方提供允许集合；Shared parser 需要支持可选上下文校验。

# Scrutiny Review

结论：`passed`

## 验收核对

| 验收项 | 结论 | 证据 |
| --- | --- | --- |
| 灵感恰好 3 个且字段严格 | 通过 | `parseCreativeIdeationOutputV1` + 2/4 个、额外字段、重复标题、标签数量、重复 JSON key 负例 |
| A3 四区块与章节卡一致 | 通过 | 明确正整数章数、卡数量、连续序号、固定字段和 round-trip 测试 |
| 统一章节 Markdown | 通过 | 单章、六区块、字段顺序、连续场景、模板/系统/下游产物门与 round-trip 测试 |
| B2 analyze 严格 JSON | 通过 | 精确对象、固定枚举、来源 range、候选顺序、锚点、无重叠/缺口和 observed refs 校验 |
| B4 fidelity 严格 JSON | 通过 | 来源/行引用、完整覆盖、行顺序、finding 分类和禁止模型放行字段校验 |
| 七 stage fixture | 通过 | 七个 stage 顺序与正反样例逐项执行 |
| 兼容边界 | 通过 | 只增加版本化 Shared API；旧 Prompt/兼容 parser/数据库/页面未切换 |

## 残留风险

1. 当前生产流程仍使用旧动态 Prompt、灵感截取和 Markdown 保守包装；后续接线前，新契约不会自动改变线上行为。
2. P1～P5 的语义质量不能仅靠确定性 parser 证明；后续 Prompt 包仍需固定盲评/触发回归。
3. `sourceTitle.basis=not_provided` 在新契约中固定为 `value=null`；后续 DTO 和结果卡必须沿用，不能改回伪造标题。
4. Shared parser 文件较大但职责单一；如果后续再增加新内容类型，应按 creative/import 子模块拆分，不能继续无限增长。

# Runtime/User Review

结论：`not_applicable_by_scope`

本任务没有修改动态 Prompt、Server 路由、数据库、pending 或页面，因此没有新的真实点击路径可复核。替代运行证据：fixture subpath 可在构建产物中真实导入；Shared 全量测试、全工作区 typecheck 和 build 通过。真实 AI/页面复核必须在实施包 3～5 重新执行。

# Handoff

下一包是“来源、状态与 pending 基础”，应先设计并实现不可变 raw source、稳定 source/block refs、analysis candidate、confirmed chapter map、ImportBatch/Item 和两类 pending 来源绑定。接线时必须直接消费本包 parser，不复制另一套 Schema；不得跳过来源基础直接把新 Prompt 接到旧 `import_script_to_chapters`。
