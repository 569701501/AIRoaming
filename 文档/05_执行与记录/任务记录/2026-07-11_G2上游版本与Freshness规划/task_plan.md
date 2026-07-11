---
doc_id: AIR-TASK-20260711-G2-UPSTREAM-FRESHNESS-PLAN
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 七阶段能力缺口与升级顺序、G1数据库开发级文档、现有代码审计
---

# G2 上游版本与 Freshness 开发规划

## 目标

1. 将剧本、剧情结构、分镜和出图准备统一为“可变工作稿 → 用户确认 → 不可变正式版本”。
2. 定义稳定的来源快照和摘要，使下游能判断当前、来源已更新、历史与待确认，而不依赖 `updatedAt`。
3. 将章节最远里程碑与当前可用性分离，保留旧候选、布局、导出和任务结果，不再通过清空或倒退 `Chapter.status` 表达失效。
4. 约束长任务绑定启动时来源，旧任务迟到时只能留在原来源历史，不能更新 current 指针。
5. 本轮只写 proposed 文档，不修改 schema、migration、业务代码、数据库或真实 workspace。

## 非目标

- 不实现 G1 DB-only、G3 漫画版式、G4 候选定稿修订、G5 成稿编辑器或 G6 素材包。
- 不重新设计七阶段流程，也不做 D2 自动调度。
- 不增加一个可写的 `freshness` 真值表或批量回写所有下游行。
- 不把时间戳、文件路径或数据库行顺序放入来源摘要。
- 不删除旧版本、旧候选、旧布局、旧导出或旧任务证据。

## 强制退出标准

1. Script、Story、Storyboard、Preflight 四层的 Working Copy、发布动作、current 指针和不可变边界明确。
2. `current/stale/historical/pending` 的判断规则唯一，未知来源通过 reason code 阻塞，不另造模糊状态。
3. 每一类上游变化都有失效矩阵，明确“不影响、阻止新任务、发布后失效”的区别。
4. SourceSnapshot、JCS 摘要、乐观锁、任务适用性和迟到结果处理均有可复制协议示例。
5. 工作流能同时表达“历史成品可查看”和“当前来源需更新”，不依赖 `Chapter.status` 回退。
6. 现有 API 的保留、改语义、新增和废弃路径明确。
7. 自动化测试、迁移 witness、故障注入和用户路径验收均有清单。
8. Scrutiny Review 通过；Runtime/User Review 仅作为未来实施清单，不伪造为本轮已执行。

## 阶段

### 阶段 1：事实复核

- [x] 读取项目事实源、G1 Schema、七阶段缺口、D3 和现有验收文档
- [x] 审计 Script/Story/Storyboard/Preflight、workflow、共享 DTO 和前端派生逻辑
- [x] 确认原地覆盖、清空历史、时间戳判定和单状态投影的真实位置

### 阶段 2：版本与来源契约

- [x] 收口 Working Copy、pending、confirmed、current 指针和历史版本语义
- [x] 定义 SourceSnapshot、documentDigest、sourceDigest 和字段排除规则
- [x] 定义迟到任务、并发发布和幂等边界

### 阶段 3：Freshness 与用户路径

- [x] 定义四态 freshness、reason code、工作流 attention 和动作门禁
- [x] 完成字段级失效矩阵和传递规则
- [x] 完成剧本返修、结构返修、分镜返修和预检重确认路径

### 阶段 4：开发切片与验收

- [x] 拆分 G2-A 至 G2-F 实施顺序和回滚闸门
- [x] 编写测试矩阵、迁移 witness、故障注入和 Runtime/User Review 清单
- [x] 明确与 G1、G3、G4 的接口边界

### 阶段 5：正式文档与复核

- [x] 编写 G2 主方案、契约字典、ADR 和验收清单
- [x] 同步索引、上位架构/模块/任务协议、会话和长期记忆
- [x] 完成 Scrutiny Review 与 Handoff

## 当前深思熟虑角色边界

- **Orchestrator：** 维护 G1→G2→G4 的依赖边界，防止把候选返修和画布实现提前塞入 G2。
- **Worker：** 只编写 G2 开发级文档与事实源摘要，不修改实现。
- **Scrutiny Review：** 只读核对来源摘要、不可变性、并发、迟到结果、迁移和工作流语义。
- **Runtime/User Review：** 未来实施时验证真实返修和旧产物查看；本轮只给验收步骤。

## Handoff

- 用户已确认继续 G2 文档。
- 已完成事实/代码审计、版本/摘要/freshness 契约、G2-A 至 G2-F 拆分和验收矩阵。
- 已完成索引、上位事实源、会话/长期记忆同步与最终静态复核。
- G2 文档任务完成并获用户确认；ADR-0013 为 `active`，三份开发/验收文档为 `accepted`，实现未开始。
- 下一步等待用户继续后编写 G3 D1 漫画版式入口开发级文档。

## Result

- 新增并确认 G2 主方案、精确契约字典、ADR-0013 和完整验收清单。
- 保持 G1 44 模型，完成 Working Copy、正式发布、SourceSnapshot、source policy、派生 freshness、workflow attention、任务适用性和迁移边界设计。
- Scrutiny Review 通过；Runtime/User Review 因本轮只有文档变更而不适用，未来实施步骤已写入验收清单。
- 未修改 schema、migration、依赖、业务代码、数据库、密钥文件或真实 workspace。
