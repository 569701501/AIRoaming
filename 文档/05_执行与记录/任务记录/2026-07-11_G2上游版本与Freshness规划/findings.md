---
doc_id: AIR-TASK-20260711-G2-UPSTREAM-FRESHNESS-FINDINGS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 项目文档、现有代码与共享契约只读审计
---

# G2 上游版本与 Freshness 发现

## 已确认事实

- `saveChapterDraft` 和 `confirmChapterPendingSource` 直接更新 `sourceText`，不会在已完成章节上同步发布新的 ScriptVersion。
- `updateChapterStoryStructure` 原地更新当前 `ChapterStoryStructure`，current ID 不变；旧分镜无法识别结构语义已变。
- `updateChapterStoryboard` 原地更新当前 storyboard，并直接置空 preflight、candidates、layout，再把章节状态回到 `storyboard_done`。
- `confirmChapterStoryStructure` 会清 pending storyboard/preflight，但保留更深层对象的行为并不统一；依赖失效由各 Service 手写。
- `resolveImagePreflightCharacter` 会原地改写已确认 storyboard 的角色绑定，违反确认版本不可变目标。
- Preflight 目前用 `sourceStoryboardId + sourceStoryboardUpdatedAt` 判定复用；时间戳既不能证明内容相同，也不能表达角色图、场景图和画风输入变化。
- Story 文档内含 `referenceAssetId`，Storyboard Shot 内含 `lockedCandidateId/status`；这些下游或资产状态若进入文档摘要，会造成错误级联失效。
- 前后端各有一份以 `Chapter.status` 为主的 workflow 推导，未来必须收口为服务端权威投影，前端只消费或使用同一纯契约。

## 设计约束

- G1 已为 Chapter 提供 script working fields、current/pending 指针；StoryVersion/StoryboardVersion 的 pending 行可承担 Working Copy，无需再增加通用 Document 表。
- confirmed 版本与 source snapshot 必须不可变；freshness 只从 current 指针和来源关系派生。
- 未确认 Working Copy 不能成为新下游任务输入，但旧正式链和历史导出仍可查看。
- 新上游发布后不清空 confirmed 下游；当前指针可以暂时指向 stale 版本，直到用户确认新下游版本。
- pending 基于旧来源时应归档并清 active pending 指针，不能继续确认；运行任务结果保留在原 task/output，不自动成为当前 pending。

## 已收口决策

- 不新增 `StoryWorkingCopy/StoryboardWorkingCopy/FreshnessState`；保持 G1 44 模型。
- Story/Storyboard pending 行补 `origin/rowVersion/archivedAt/sourcePolicyVersion`，pending 可变，confirmed/archived 不可变。
- freshness 固定为 `current/stale/historical/pending`；未知旧来源用 `stale + *_SOURCE_UNRESOLVED`，不新增模糊 unknown。
- Script dirty 或 Story/Storyboard active pending 不会让旧正式链 stale，但会通过 NewWorkGate 阻止所有新下游工作。
- StoryDocument V2 移出 SceneVisual；StoryboardDocument V2 移出 Candidate lock/生成状态；时间戳、路径和 chapterTitle 不进入摘要。
- Preflight SourceSnapshot 精确覆盖 current Storyboard、实际出镜角色生成输入、选用 CharacterVisual/SceneVisual、Asset sha、comicFormat、artStyle 和 policyVersion。
- sourcePolicyVersion 必须随版本保存；旧 policy 无法重建时阻止，不用当前 policy 猜测。
- Preflight notes 不参与生成 sourceDigest；只改 notes 的新确认保留相同生成语义。若未来 provider 真读取 notes，必须升级 policy 并纳入摘要。
- 里程碑保持单调；workflow 新增 `needs_confirmation/needs_update` 及 freshness/attention/reason code 投影。
- 旧任务完成必须同时通过 claimToken、active target、target rowVersion、current 来源和 sourceDigest，失败只登记 historical。

## 当前风险

- 如果把“有未确认修改”和“正式来源已失效”混为一个状态，用户会不知道旧导出是否仍可信。
- 如果 `documentDigest` 包含时间戳、场景参考图或候选锁定字段，会产生无意义失效甚至摘要循环。
- 如果只在任务创建时校验来源，迟到结果仍可能覆盖新 current；完成写回必须再次校验。
- 如果确认接口继续接受完整 Json 而不带 expected digest/current ID，预览后并发修改会被静默覆盖。
- 如果 G2 同时实现 D3 影响预览或 Layout freshness，会越过 G4/G5 的阶段边界。

## web_search

- 本轮不需要最新外部技术资料；来源摘要沿用 G1 已确认的 RFC 8785 JCS + SHA-256 契约。

## Scrutiny Review

结论：通过，无阻断项。

- 新文档的链接、代码围栏、frontmatter、doc_id、状态和 proposed/implemented 表述一致。
- G2 只补 Story/Storyboard/Preflight 字段和 codec/服务边界，G1 模型总数保持 44。
- `sourcePolicyVersion` 已补入版本契约，避免用新摘要 policy 误判旧版本。
- Preflight lifecycle 与 freshness 已分离：status 使用 confirmed/archived，current/historical 由指针派生。
- Preflight notes 与生成 sourceDigest 的关系已明确；如果未来进入 provider 输入，必须升级 policy。
- 用户流程和核心数据模型已把 `updatedAt/清空下游` 标为当前实现，并指向 G2 已采纳目标。
- 任务创建和完成分别有 NewWorkGate/TaskApplicabilityGuard，迟到结果不能更新 active pending/current。
- 迁移证据不足统一 stale + reason code，不伪造 current 或被旧实现删除的历史。

## Runtime/User Review

- 本轮不适用：没有修改 schema、代码、数据库、页面或真实 workspace。
- 未来实施必须按 `G2上游版本链与失效验收清单.md` 执行剧本未确认修改、逐级发布、来源资产变化和并发历史四条用户路径。
