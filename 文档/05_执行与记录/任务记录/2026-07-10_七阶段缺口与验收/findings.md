---
doc_id: AIR-TASK-20260710-SEVEN-STAGE-GAP-FINDINGS
status: active
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md、代码、测试与真实 workspace
---

# 七阶段能力缺口与完整链路验收发现

## 已确认事实

- 七阶段键为 `project_story -> story_structure -> storyboard -> image_preflight -> image_candidates -> layout_export -> asset_package`。
- 等待步骤在顶部流程栏禁用；阶段推进由完成、确认、锁定或导出等用户动作触发。
- 真实第 1 章当前处于 `image_candidates`，前四步为 `done`，排版和素材包为 `waiting`。
- 真实第 1 章共有 15 个镜头、27 张已生成候选、0 张锁定。
- 当前自动化测试覆盖 workflow 状态映射和候选生成契约，但没有覆盖 `draft -> exported` 完整用户路径。
- `saveChapterDraft`、`confirmChapterPendingSource` 和旧项目更新入口在已推进章节上修改正式正文时，不会统一更新 ScriptVersion/current 指针或下游 freshness。
- 剧情结构 pending 使用进程内 Map；确认/编辑结构时旧 storyboard/candidates/layout 仍可能保留，正式结构字段编辑会原地更新同一版本。
- 分镜 pending 已持久化，新增/删除/拖拽重排已实现，不应继续列为缺口；正式编辑仍原地改同一 storyboard 版本。
- 出图准备已绑定正式 storyboard ID/更新时间并在来源不匹配时失效，方向正确；仍需进入数据库修订和统一 sourceDigest。
- 候选图已有真实生成、批次、生成规格、参考图解析和逐镜头锁定；缺口集中在 ADR-0010 修订式定稿和 D75 持久任务。
- 排版服务按一镜一页创建单 placement，导出只复制 `placements[0]` 对应源图；不是正式漫画合成器。
- 素材包 Asset 指向目录而非 ZIP，页面无下载动作，通用 Asset 文件接口会尝试 `readFile` 目录；manifest 也没有摘要、字节和来源修订。
- 项目列表状态投影只可能是 `draft/story_ready/characters_ready`，无法表达已到分镜、候选、排版或导出。
- 剧本、结构、分镜等章节步骤的对话 key 已支持 chapterId；“章节对话隔离未实现”属于旧文档口径，不进入缺口。

## 待核对问题

1. G0 的 Web E2E 技术选型、启动隔离和 fixture 目录已在 2026-07-11 开发级文档确认，等待用户授权实现。
2. D4/D5 E0 仍需用可丢弃原型比较编辑内核与服务端渲染路线。
3. Runtime/User Review 需要用户在真实页面执行，当前只完成代码、数据和文件静态审计。

## 风险

- 把后半段骨架当完整能力，会导致“链路已通”的错误验收。
- 把真实样例未走完误判为 workflow 未实现，会重复开发阶段框架。
- 在缺少来源修订与失效规则时直接升级编辑器，容易继续覆盖或混用旧候选、旧布局和旧导出。

## 方案结论

- 开发依赖顺序为 G0 行为刻画 → G1 D7 DB-only → G2 上游版本/freshness → G3 D1 → G4 D3 → G5 D4/D5 → G6 素材包 V2 → G7 完整 E2E。
- 线性阶段与 freshness 必须分离；正式版本链为 ScriptVersion → StoryVersion → StoryboardRevision → PreflightRevision → CandidateLockRevision → LayoutRevision → ExportRevision → PackageRevision。
- Prompt 质量系统、自动调度、轻漫剧和 R5 均不并入本方案。

## Scrutiny Review

- **通过：** 七阶段现状、真实缺口、ADR 目标、G0–G7 顺序和验收基线互相一致。
- **不适用：** 本轮没有代码 diff，因此不做实现代码审查、migration 演练或渲染结果验收。
- **待用户/运行复核：** 用户确认总方案；实现后按 `七阶段完整链路验收基线.md` 执行真实页面、任务恢复、导出图和 ZIP 验收。
