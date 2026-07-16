---
doc_id: AIR-TASK-20260716-SCRIPT-P6-FINAL-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 双流程 Skill、Prompt、parser、触发与测试探索
---

# 双流程 P6 总验收发现

## 当前事实

- 正式体系为 5 个公开 Skill、7 个模型阶段；`script-import-normalize` 内部编排 analyze、materialize、verify 三阶段。
- Shared 已为七阶段各提供一组严格正反输出 fixture，并由唯一 parser 测试消费。
- A4、A5、导入目录确认已有明确正反意图测试；A2、A3、B1/B2 触发存在生产函数，但尚未与前述阶段集中列在同一 P6 固定矩阵。
- materialize 和 verify 是目录确认后由后台批次顺序触发的系统阶段，不应单独增加用户意图或公开 Skill。

## 决策

- 增加测试矩阵而不是新运行时注册表，避免为测试复制生产路由。
- 直接调用现有意图函数、Shared stage IDs 和严格 fixture；测试只锁行为，不读取私有状态。
- Prompt 文案没有发现需要改变输出格式或产品行为的缺口；先补验收证据和旧文档数量纠正。

## 风险

- 固定测试证明触发、格式和高置信禁止项，不证明所有模型输出的艺术质量。
- 不调用真实外部模型；真实模型差异仍需未来基于实际失败样例迭代。

## 运行时事故与结论

- 第二章显式生成的偶发失败不是章节或对话线程被删除。失败请求中 `DialogueRuntimeSession.externalSessionId` 实际为 `null`。
- 根因是 `ensureOpenCodeSession` 把新会话号先写入共享 `LocalDialogueThread`，随后页面轮询的旧 DB 查询结果把同一字段覆盖为 `null`；事务回调再次读取共享字段时得到空值。
- 正确边界是：外部 `createSession` 返回值在当前调用内保持局部不可变，DB 持久化成功后才更新共享线程；hydration 若看到 DB 空而内存有值，必须按 `threadId + externalSessionId + active` 二次核验。
- 不能简单永久保留内存值，否则应用重启将复用已经由 interruption recovery 关闭的旧会话；`P7-DIALOGUE-DB-01/02/03` 共同锁住这三个方向。

## 最终结论

- 5 个公开 Skill、7 个模型阶段、正反触发、Prompt、strict parser 和确认门一致。
- `import.materialize/verify` 是系统阶段，不增加用户入口。
- 无页面、Schema、输出字段或流程变化；Scrutiny 与 Runtime/User Review 均通过。
