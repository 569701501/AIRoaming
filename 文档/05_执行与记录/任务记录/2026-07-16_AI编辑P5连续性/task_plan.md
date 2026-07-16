---
doc_id: AIR-TASK-20260716-EDIT-P5-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: A+ AI 创作路线、P5 连续性检查与现有 P4 编辑链
---

# AI 编辑 P5 连续性任务计划

## 目标

保持现有 A5 页面和 revision pending 操作不变，让第 N 章章节改写真实读取上一章当前正式正文，并在改写结果丢失已有承接或来源版本发生变化时 fail-closed。

## 非目标

- 不新增页面字段、连续性面板、评分或确认节点。
- 不修改章节 Markdown 或 StoryStructure。
- 不把下一章章节卡当作已经发生的事实。
- 不使用模糊总分证明完整世界状态一致。
- 不在本轮新增 revision pending 来源策略或数据库迁移；当前 legacy pending provenance 缺口单独保留。
- 不改变已有剧本导入章节 V1 的不可编辑规则。

## 最小契约

1. 第 1 章没有上一章，P5 跳过但 P4 继续执行。
2. 第 N 章必须读取第 N-1 章当前正式 `ChapterScriptVersion`；缺失时在模型调用前阻断。
3. Prompt 注入完整上一章正文、版本身份和只读用途，不允许 AI 改写上一章。
4. 固定校验采用“连续性不得退化”：只有源稿已经承接稳定锚点、改写稿却丢失时才触发。
5. 创建 revision pending 的同一事务复核上一章版本 ID、章节 ID 和摘要；变化则拒绝写入。
6. 格式、P4 和 P5 继续共用一次修订预算；第二次失败不创建 pending。

## 阶段

| 阶段 | 角色 | 内容 | 状态 |
| --- | --- | --- | --- |
| D1 | Orchestrator | 读取事实源并探索编辑、正式版本和 pending 写入链 | completed |
| D2 | Worker | 上下文查询、Prompt 注入、P5 校验与事务围栏 | completed |
| D3 | Worker | 聚焦、全量、类型、构建与 DB-only 用户路径验证 | completed |
| D4 | Scrutiny Review | 静态复核误杀、来源真实性和迁移边界 | completed |
| D5 | Runtime/User Review | 复核第 2 章显式生成、采用、改写路径 | completed |
| D6 | Orchestrator | 正式文档、完成记录、记忆和提交 | completed |

## 验收标准

- 第 2 章编辑 Prompt 包含第 1 章当前正式全文，而不是摘要猜测。
- 第 1 章编辑不要求虚构上一章。
- 源稿已有承接、改写稿丢失时只定向修订一次；第二次仍失败不写 pending。
- 上一章当前正式版本在模型运行期间改变时，数据库事务拒绝旧结果。
- 仅建议请求仍不触发写入；P4 四层行为不回退。
- 页面、章节 Markdown、数据库 Schema、A5 和导入路线不变。

## 退出标准

- D1～D6 完成。
- Handoff、Scrutiny Review、Runtime/User Review 有明确结论。
- 正式产品/架构/测试文档、会话记忆和长期记忆同步。
- 提交后工作区清洁。
