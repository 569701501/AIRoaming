---
doc_id: AIR-G2-E1-FINDINGS-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-E1 代码探索
---

# 探索发现

- Shared 已有 `ChapterProductionState`、`resolveChapterProductionState` 和完整四层 reasonCodes；Server 的 B1 `ScriptVersionRepository.toProductionState` 已能把 scoped Chapter rows 组装为 resolver input。
- 现有 `ProjectWorkflowStepStatus` 只有 `done/active/waiting/blocked`，与 E1 施工资料要求的 `needs_confirmation/needs_update` 不一致；需要向后兼容扩展 Shared DTO，旧 file-mode workflow 继续返回旧状态。
- `ChapterVersionQueryRepository` 已一次性 include Script/Story/Storyboard/Preflight current/pending/history，适合作为 E1 查询唯一读入口。
- 0009 NewWorkGate SQL trigger 已覆盖 task seal 的机械条件，但尚无应用层可复用的四类 gate；E1 需先在 Service 级返回稳定 reasonCodes，再保留 DB trigger 作为最终防线。
- Preflight、持久 worker 和 TaskApplicabilityGuard 尚未实现，因此 `shot_prompt_generate/image_generate` 在 E1 中只能明确拒绝缺少 current Preflight，不能伪造放行。

## E1 结论

- 查询服务只通过 `ChapterVersionQueryRepository` 做 scoped DB read，再复用 Shared resolver；没有写回 freshness，也没有把旧 `Chapter.status` 当作唯一真值。
- Workflow 的 `needs_confirmation` / `needs_update` 是向后兼容的 Shared 扩展；legacy file-mode workflow 仍可只返回旧状态集合。
- 应用层 Gate 与 0009 trigger 形成双层防线：应用层提供稳定可解释的 reasonCodes，数据库 trigger 继续负责最终机械拒绝。
- E1 不声明 Preflight、worker、TaskApplicabilityGuard、history 或 capability switch 已完成；这些留给 E2/F/后续切片。
