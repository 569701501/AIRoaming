---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-PRODUCTION-FINDINGS
status: active
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 事实发现

- `ScriptWorkflowSourceRepository` 已实现 createRawSource、createAnalysisCandidate、confirmAnalysisCandidate、startImportBatch、beginImportItem、markImportItemVerifying、recordImportFidelity 和 confirmImportPending。
- 当前仓储缺少供生产 Prompt 使用的原稿全文/稳定 block 读取、单个批次项的确认范围上下文、批次结果投影和显式失败记录能力。
- `ScriptDialogueService.tryHandleScriptImport()` 仍调用旧 `ProjectsService.analyzeScriptImport/importScriptToChapters`；后者在 DB-only 中明确 retired。
- Shared 严格协议已能检查原稿 block 全覆盖、章节范围不重叠、顺序连续、边界证据锚点、输出行引用和忠实度硬问题。
- `ScriptPendingSuggestionDto` 已暴露 `kind=import` 和来源绑定；Web store 已读取该 DTO，但正文组件只读取不含 kind 的旧 `ChapterPendingSourceText` 投影。
- 现有 `script-import-normalize` Skill 仍使用旧 decision/chapters/nextTool 协议，并允许保守补全与“待补充”，需要重写为 B1～B5 严格契约。

# 风险

- 完整原稿可能超过单次模型上下文；首版必须至少保证服务端不主动截断中段，并在模型失败时诚实记录失败，不能伪造覆盖率。
- 目录确认后的 2N 次模型调用可能耗时；必须逐章持久化状态和隔离失败，不能在单章错误时回滚整批。
- import pending 若继续复用通用按钮，会违反用户已确认的只读直接发布语义。

# 最终结论

- DB-only 已有剧本路线不再调用旧整本覆盖能力；唯一生产路径是 `ScriptDialogueService → ScriptWorkflowSourceRepository → ScriptImportBatchService → import pending 专用确认事务`。
- 目录确认是项目级一次决策，章节确认是独立逐章决策；其他章节 pending 或失败不阻断当前已确认章节进入 StoryStructure。
- import pending 与 AI pending 共用正文展示区域，但动作语义完全分开；现有页面内容字段未增加。
- 分析候选和忠实度均使用 Shared 严格 parser，AI 不生成数据库 ID；服务端补来源、版本、摘要、CAS 和批次状态。
- 正常长度原稿的 B1～B5 已完成。当前批次在一次 HTTP/对话请求内同步逐章执行；失败状态已持久化和隔离，但尚无公开重试/恢复入口。
- 服务端不主动截断原稿，严格分析要求 block 完整覆盖；超出单次模型上下文的超长稿仍需后续分层分析能力。
