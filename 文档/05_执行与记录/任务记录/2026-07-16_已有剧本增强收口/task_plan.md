---
doc_id: AIR-TASK-20260716-SCRIPT-IMPORT-ENHANCEMENT-PLAN
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer
source: 已有剧本 B1～B5 完成记录与用户“继续完成”要求
---

# 目标

完成已有剧本路线最后三个增强项：超长稿分层分析、后台可恢复批次、失败章节重试入口，同时保持 B1～B5 用户流程和页面内容字段不变。

# 非目标

- 不新增 ChapterPlan，不修改 StoryStructure payload。
- 不把导入草稿变成可编辑，不增加采用、丢弃、AI 重新整理或批量确认。
- 不让目录确认等待全部章节生成完成。
- 不使用第二套通用 GenerationTask 事实源替代 0017 import batch；导入批次仍是唯一状态事实源。
- 不承诺任意无限长度；超长稿必须无静默截断、可分层处理，最终输出本身超出模型能力时应诚实失败。

# 设计决策

1. 长稿分析复用 `import-analysis/1.0`：短稿单次分析；长稿按稳定 block 和字符预算切分，叶子节点严格分析，再按相邻节点分层合并，最终结果仍对全原稿做完整覆盖校验。
2. 不新增 migration。`ScriptImportBatch/Item` 继续作为后台状态事实源；专用 worker 每次只处理一章，轮询 queued 项。
3. 服务启动时把上次中断的 `materializing/verifying` 标为明确中断失败；未超过自动恢复次数的项加入一次恢复队列，剩余 queued 自动续跑。
4. 用户手动重试只作用于一个 `generation_failed` item；不批量重试，不修改目录，不覆盖其他 pending/正式章节。
5. 结果卡通过只读批次查询轮询更新；轮询只更新页面投影，不伪造新的对话消息或正式产物。

# 阶段

1. 长稿：分块、分层合并 Prompt、严格解析与正反测试。
2. 后台：专用 worker、启动恢复、单章执行和目录确认快速返回。
3. 页面：批次查询、轮询、失败项重试、进度与错误展示。
4. 验证：单元、fresh SQLite、DB-only Chromium、完整回归、Skill/文档。
5. 复核：Handoff、Scrutiny、Runtime/User Review、完成记录、记忆与提交。

# 验收标准

- 超过单次阈值的原稿会发生至少两次叶子分析和一次合并，最终候选覆盖所有 block，无中段静默丢失。
- 目录确认请求在创建批次后返回 queued/processing 状态，不等待 N 章全部生成。
- 后台执行器逐章推进；服务重启后 queued 项继续，中断项形成可追溯失败并按策略自动恢复一次。
- 页面自动刷新批次状态，成功章出现 import pending；失败章显示单章“重试”，重试不影响成功章。
- 用户逐章确认和进入 StoryStructure 的既有行为不变。
- 关键正反路径有自动测试并完成真实 DB-only 浏览器复核。

# 退出标准

- 全部阶段完成并有验证证据。
- Scrutiny 与 Runtime/User Review 通过。
- 产品、架构、模块、测试、会话和长期记忆同步。
- 新增独立提交，工作树干净。

## 完成结论

长稿分层、后台恢复和失败章重试均已实现；静态复核与 DB-only 用户路径通过。执行器明确保持本地单服务进程边界，未扩展为多实例 lease 系统。
