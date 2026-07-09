# 候选图工作台第一版任务计划

---
doc_id: AIR-TASK-20260708-CANDIDATES-PLAN
status: completed
created: 2026-07-08
updated: 2026-07-08
owner: AI漫游项目
audience: human, ai-agent
source: 2026-07-08 用户要求“启动起来，继续往下做，先思考再做”
---

## 目标

在现有“出图准备”之后，推进“候选图工作台”第一版，让主流程第 5 步不再只是占位页。

第一版优先建立可运行、可验证的业务闭环骨架：

- 用户进入候选图工作台能看到当前章节正式分镜。
- 系统能基于已确认的出图准备判断候选图是否可生成。
- 用户能为单个分镜创建候选图生成任务。
- 任务结果、候选图状态和后续锁定能力有清晰契约，不和排版导出混在一起。

## 非目标

- 不在本阶段完成漫画排版导出和素材包。
- 不做完整图片 provider 质量调优。
- 不做复杂批量调度、失败重试策略或候选图 A/B 统计。
- 不引入新数据库；继续沿用当前本地 workspace + 进程内任务模式。

## 验收标准

- 候选图步骤拥有真实前端工作区组件，不再显示通用占位。
- 对未完成分镜或未确认出图准备的章节，页面给出明确阻塞原因。
- 对已满足条件的分镜，页面提供生成候选入口，并创建符合 `image_generate` 章节作用域约束的任务。
- 相关共享 DTO、后端 API、前端 store 和页面状态保持一致。
- `corepack pnpm -r typecheck`、`corepack pnpm -r --parallel --filter @airoaming/shared --filter @airoaming/server test`、`corepack pnpm -r build` 通过。

## 阶段

| 阶段 | 角色 | 内容 | 状态 |
| --- | --- | --- | --- |
| 0 | Orchestrator | 启动应用、读取事实源、建立任务记录 | done |
| 1 | Worker | 梳理候选图现有契约与缺口，确定第一版最小设计 | done |
| 2 | Worker | 实现候选图工作台骨架和单镜头生成任务入口 | done |
| 3 | Scrutiny Review | 静态复核契约、代码边界和测试证据 | done |
| 4 | Runtime/User Review | 运行页面，验证真实路径和残留风险 | done |

## 当前决策

- 候选图工作台第一版沿用现有 7 步 workflow，不新增主流程步骤。
- 第一阶段先让用户能“进入候选图页并创建章节作用域 image_generate 任务”，锁定和排版可作为后续阶段扩展。
- 优先复用 `TasksService` 和已有出图准备 guard，不绕过任务协议直接写图。
- 本阶段暂不新增 `Candidate` 持久化或锁定 API；原因是这会连带修改 `LocalChapter`、workspace 文件、`Shot.lockedCandidateId`、排版导出入口。先建立任务入口和页面状态，再进入候选资产落库阶段。
- 完成时确认：第一版只创建并展示 `image_generate` 任务状态，不宣称已有真实候选图资产。

## 退出标准

- [x] 阶段 1 形成明确实现边界后再写业务代码。
- [x] 阶段 2 完成后更新 `progress.md`、必要事实源和完成记录。
- [x] 阶段 3/4 记录复核结论；浏览器点击生成路径因插件会话超时未作为完成证据，改用真实 API 成功路径验证并记录残留风险。
