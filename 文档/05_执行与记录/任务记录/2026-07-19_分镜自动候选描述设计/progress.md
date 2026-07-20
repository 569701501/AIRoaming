---
doc_id: AIR-TASK-20260719-AUTO-CANDIDATE-BRIEF-PROGRESS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 进度日志：分镜自动候选描述设计

## 2026-07-19

### 阶段 1：事实恢复

- **状态：** completed
- 已读取项目事实源、现有镜头视觉编译完成记录及当前代码链路。
- 已确认候选图工作台直接从正式 Shot 的 `panelDescription/coreAction/composition` 初始化三段草稿。
- 已确认现有分镜固定门主要拦截跨地点、多时刻、不可见信息和文字冲突，不保证描述一定足够细。
- 已确认当前 `shot_prompt_generate` 依赖正式 Storyboard 与已确认 Preflight，不能直接前移到分镜生成之前。

### 阶段 2：方案设计

- **状态：** completed
- 已形成“一次点击生成分镜，内部先拆镜再批量整理视觉描述”的推荐方案。
- 用户回复“继续”，确认按推荐方案进入实施。

### 阶段 3：Worker 实施

- **状态：** completed
- 已新增 `storyboard-shot-generate/visual-brief-*` 生产 Prompt、示例和一次返修模板。
- 已新增共享章节级整理器，接入 Dialogue 与持久 `shot_generate` 两条生产路径。
- 已按镜头 `order` 严格解析并只覆盖四个静态说明字段；多人点名、总人数和现有候选单帧问题全部在落 pending 前检查。
- 已把候选图页改为“生成分镜时已自动整理，可继续微调”，旧入口改为“重新优化本镜头 / 采用返修结果”。
- 已补三人同镜、冻结剧情字段、一次返修、无部分写入、双生产路径和页面 E2E 回归。
- 数据边界保持不变：不新增数据库表，不新增顶层步骤，不提前调用图片 Provider。

### 阶段 4：复核与运行验收

- **状态：** completed
- 定向 24 项测试、Workspace/E2E 类型检查、生产构建与 `git diff --check` 已通过。
- 已在真实候选图工作台核对新文案、可选返修卡、按钮状态和浏览器 error/warn 日志。
- 分镜质量门 E2E 1/1 通过，证明骨架首次失败后只修复一次，再进入章节级自动详细说明并只形成 pending。
- 候选图工作台 E2E 1/1、G2 DB Working Copy E2E 3/3、fake provider 合同 3/3 通过。
- Server 全量并行回归 801/805；4 项为既有固定 5 秒测试的并行超时，相关 9 项隔离单 worker 全部通过。
- Scrutiny Review 与 Runtime/User Review 均通过；产品、协议、模块、完成记录、会话记忆和长期记忆已同步。

## Handoff

- 当前方案不新增数据字段或数据库表，深化现有 Shot 三段语义和 `promptDraft`。
- 最终复核确认：第二段只能覆盖四字段、两条路径行为一致、失败不落 pending、历史正式分镜不被迁移。
- 完成记录：`文档/05_执行与记录/功能完成记录/2026-07-19_分镜自动候选描述.md`。

### 阶段 5：真实模型回归问题

- **状态：** completed
- 用户要求后，在真实项目“杀令入棺”点击“重新生成”。第一段模型调用约 128.7 秒，固定门返修约 100.3 秒；第二段详细说明尚未开始。
- 返修后仍报 `STORYBOARD_PANEL_MULTIPLE_LOCATIONS`，涉及 shots[0]/[1]/[4]/[9]/[11]；系统没有创建或替换 pending，旧正式 12 镜保持不变。
- 抽取实际输出后确认 5 镜均为单一地点、单一时刻，命中原因是 `comic.composition` 使用 `→` 表示合法阅读动线；当前 `PANEL_LOCATION_TRANSITION` 把任何裸箭头都当成地点切换，属于固定门误判。
- 已把地点跳转按内容字段与构图字段分域检查：内容仍拒绝裸箭头，构图允许阅读动线箭头但继续拒绝真实转场词。
- 第二次真实运行进入详细说明阶段，暴露中文“两人”未被人数规则识别、非人角色被计入人类总人数；已按人类主体计数并兼容“两”。
- 第三次真实运行暴露行首表演提示导致逐字对白候选失真，以及结构中的“字迹浮现”被照抄进候选图画面；已把表演提示从可配音原句中编译移除，并要求把画内文字翻译为符位、光效、道具状态和人物反应。
- 第四次真实运行第一段约 61.5 秒、第二段约 26.8 秒，均一次通过，12 镜完整写入 pending；保存后回读因候选工作台同时扫描 current 与 pending Shot 报 `SHOT_NOT_FOUND`。
- 已让候选工作台只读取当前正式 Storyboard 的 Shot，新增 current 与 pending 同时存在的 DB 集成回归。修复后 Workbench API 返回 200，页面恢复“待确认预览 · 12 镜”。
- 浏览器展开并逐字命中双人、四人加群体、人物加尸体、人物加非人角色、结尾多人五类详细说明；确认按钮存在但未点击。
- 最终验证：分镜相关 73/73、current/pending DB 集成 1/1、Server 类型检查与 `git diff --check` 通过；图片 Provider 调用为 0。

### 阶段 6：群体范围真实回归补丁

- **状态：** completed
- 用户再次生成时，第 13 镜详细说明两次均原样返回“商队众人”，未带人数/范围，触发 `VISUAL_BRIEF_VISUAL_GROUP_COUNT_MISSING:shots[12]`。
- 确认固定门拦截正确：裸写群体身份不足以告诉图像模型需要绘制多人；问题在于第二段需要自行反推逐镜约束，返修 Prompt 又没有解释错误码。
- 新增后端编译的逐镜 `requiredHumanTotal/requiredCollectiveRanges`；group 镜头直接获得 `groupName` 和中性 `neutralRangeExample`，不再从整章角色表反推。
- 返修 Prompt 现在说明 `shots[n]` 是零基数组下标，并对群体范围、多人总数、绑定角色缺失/误加给出可执行动作。
- 群体范围提取支持按实际绑定名识别“一群商队众人”，并把“一群”编译进后续 Candidate Shot Contract；裸写“商队众人”仍保持 blocking。
- 真实浏览器重新点击生成：骨架首次因画内文字问题返修一次；详细说明首次 JSON 截断后返修一次；最终 12 镜全部通过并写入 pending。第 4/7/9/11/12 镜均显式带群体范围，“确认分镜”按钮存在但未点击，浏览器 error/warn 为 0。
- 相关回归、Server 类型检查与 `git diff --check` 通过；Server 全量首轮出现 1 项无关来源封存集成用例的并行波动，该文件隔离复跑 3/3 通过。
- 最终服务端全量简洁模式复跑为 136 files / 815 tests 全部通过；相关聚焦集为 8 files / 44 tests 全部通过。
