# 发现与决策

---
doc_id: AIR-TASK-20260719-STORYBOARD-REBASE-FINDINGS
status: completed
created: 2026-07-19
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 需求

- 用户已经完成出图准备并生成候选图，返回分镜工作台重新生成后，点击确认出现 `UPSTREAM_SOURCE_STALE`。
- 需要先确定产品上如何允许返修，同时保护已有出图成果和版本追溯。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `ADR-0013_上游版本链与派生Freshness.md` | pending 不影响旧正式链；确认新上游后旧下游保留并派生 stale；里程碑不倒退 |
| `核心数据模型.md` | pending 只能预览编辑，不能直接进入候选图输入 |
| `当前UI信息架构.md` | 已完成章节允许回到上游返修，需提示后续产物可能更新 |
| `workbench-store.ts` | 页面确认分镜时用 `toStoryDocumentV2` 从展示数据重建并计算 source digest |
| `storyboard-version.repository.ts` | 服务端严格比较请求 source digest 与 current Story document digest |
| `storyboard-dialogue.service.ts` | 对话确认路径使用 pending VersionSummary 自带的 source ID/digest，契约方向正确 |

## 研究发现

1. 当前章节正式 Story ID 与 pending Storyboard 冻结的 source ID 相同。
2. 当前正式 Story digest 与 pending 冻结的 source digest 相同，说明 pending 来源仍是 current。
3. 页面重算 digest 与权威 digest 不同；差异仅出现在一个 group 角色的 `projectCharacterId`。
4. 正式结构卡明确绑定“商队多人”的 Character ID；前端 group 角色适配却优先按视觉身份匹配到“商队众人”的另一条 Character，覆盖了显式绑定。
5. 因此刷新不会解决问题，现有通用 409 文案误导用户。
6. 当前章节里程碑仍为 `storyboard_done`，32 个候选已存在；本次真实错误尚未触发 `images_done` 倒退约束，但确认代码固定写回 `storyboard_done` 仍是后续必须修复的独立问题。

## 证据

| 证据 | 结论 |
| --- | --- |
| 实库 Chapter/Story/StoryboardVersion 只读查询 | current Story 与 pending source ID/digest 完全一致 |
| 当前运行服务 Working Copy API | pending 与 current VersionSummary 暴露相同 source digest |
| 前端生产适配函数重算 | 得到不同 digest，稳定复现服务器拒绝条件 |
| 正式 Story 文档与重建文档逐字段 diff | 只有 group 角色 `projectCharacterId` 被换成相似群体角色 ID |

## 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| 客户端重算正式 source digest | 展示映射或代码升级会制造假冲突 | 回显并提交 pending 自带的冻结 digest |
| 所有 409 使用同一刷新文案 | 真 stale、并发冲突、客户端 bug 无法区分 | 按稳定 error code 给出不同处理 |
| 确认按钮没有下游影响预览 | 用户不知道旧图会变历史 | 确认前展示候选/定稿/布局/导出影响数量 |
| 确认固定把里程碑写回 `storyboard_done` | `images_done/layout_done/exported` 会违反单调约束 | 取当前里程碑与 storyboard_done 的较高者 |
| 重生成每镜分配新 Shot ID | 无法安全自动识别未变化镜头 | 第一阶段整章需更新；后续再做稳定匹配与按镜来源摘要 |

## 推荐技术决策

| 决策 | 依据 |
| --- | --- |
| Confirm 请求提交 `working.pending.sourceId/sourceDigest` | pending 已冻结生成时真实来源，且对话路径已采用 |
| 服务端事务仍比较 pending source 与 current Story | 保持真 stale fail-closed，不降低保护强度 |
| 真 stale 时不允许强制确认 | 否则分镜会正式绑定旧结构；应重新生成或重新基于当前结构建立 pending |
| 下游存在不阻止确认 | 上游返修是正常流程；旧产物保留为 historical，current 链转 needs_update |
| 里程碑单调、Freshness 回到需更新 | 与 ADR-0013 一致，可同时表达“曾完成”和“当前需返修” |

## 推荐用户路径

```text
重新生成分镜
  -> 保存待确认草稿
  -> 旧正式分镜和旧图继续可查看
  -> 暂停创建新的下游任务

点击确认新分镜
  -> 服务器先判断 pending 来源是否仍是 current
  -> 若一致：展示影响清单，用户确认后切换正式分镜
  -> 若不一致：提示剧情结构已更新，要求基于当前结构重新生成

切换成功
  -> 旧候选/布局/导出保留为历史
  -> 出图准备显示“来源已更新，需要重新确认”
  -> 新候选只允许基于新 Preflight 生成
```

## 复核发现

### Scrutiny Review

- 首轮复核确认：页面不再从展示 DTO 重算来源摘要；后端仍在确认事务内比较 current Story；确认不会删除 Candidate/Layout/Export；里程碑取当前值与 `storyboard_done` 的较高者。
- 首轮发现 Story ID 变化仍被归为泛化的 `UPSTREAM_WORK_NOT_CONFIRMED`，可能继续诱导盲目刷新。已调整来源门：只有上游未确认、存在 pending 或剧本 dirty 才返回该错误；已确认但 ID 或 digest 不一致统一返回 `UPSTREAM_SOURCE_STALE` 并附 expected/actual 证据。
- 修正后复核未发现阻塞项；真实 stale 仍 fail-closed，错误来源摘要不再放宽服务端保护。

### Runtime/User Review

- 使用隔离 DB 项目和真实 Chromium 完成“生成 3 张候选图→定稿 1 张→完成出图→建立新分镜 pending→查看/取消影响提示→再次确认切换”路径。
- 切换后章节仍为 `images_done`，pending 清空，current Storyboard ID 变化，3 张旧候选仍保留，出图准备步骤为 `needs_update`。
- 用户真实项目未自动点击最终确认，避免未经授权改变正式版本；其错误条件已由相同 API/Store 契约回归覆盖。
- 页面证据：`evidence/storyboard_revision_impact.png`。

## 遇到的问题

| 问题 | 解决方案 |
| --- | --- |
| 通用错误文案声称刷新可解决 | 通过权威 digest 与重算 digest 对比证明刷新无效，应改为 code-specific 文案 |
