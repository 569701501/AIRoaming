---
doc_id: AIR-TASK-20260721-CLEANUP-CLOSEOUT-PLAN
status: completed
created: 2026-07-21
updated: 2026-07-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户追问是否全部清理完成并要求检查遗漏
---

# 遗留清理收尾审计计划

## 目标

证明上一轮清理是否闭合，找出仍无生产、恢复、历史读取或有效测试责任的遗留代码；对明确遗漏继续删除，对保留项给出可复核的调用与职责证据。

## 非目标

- 不为减少行数改写 0001～0017 migration 或删除现行 trigger。
- 不删除 backup/restore、final importer、历史证据读取或 Asset 字节路径。
- 不把“标准 DB-only 不调用”等同于“恢复/导入工具无用”。
- 不覆盖工作树中 OpenCode、Prompt 和其他无关改动。

## 阶段

1. [x] Orchestrator：冻结入口类型和判死标准。
2. [x] Worker A：重建 package scripts、Nest module、CLI 与静态 import 图。
3. [x] Worker B：盘点剩余 file-mode HTTP/API/Dialogue/Repository 分支。
4. [x] Worker C：盘点 migration/backup/recovery/legacy readers，排除恢复责任。
5. [x] Worker D：只删除四类证据均为空的明确遗漏并验证。
6. [x] Scrutiny Review 与 Runtime/User Review：静态与隔离运行复核。

## 判死标准

候选只有同时满足以下条件才可删除：

1. 无标准服务、Web、package script 或正式 CLI 入口。
2. 无 Nest 注入、动态加载、worker/回调注册或配置引用。
3. 无迁移、恢复、历史只读解码或证据兼容责任。
4. 不是仍有效的测试夹具/契约基线；若仅测试调用，测试本身也必须已被正式覆盖替代。

## 验收标准

- 每个候选都有入口、调用、恢复和测试四栏结论。
- 不存在已删除文件的 package script、import、文档当前事实或构建产物引用。
- 若继续删除，typecheck、build、Prisma、相关集成与全量回归达到上一轮口径。
- 静态复核与隔离运行复核结论落盘。

## 退出标准

- 给出“仍有遗漏/无明确遗漏”的证据化结论。
- 所有明确遗漏已处理，或记录为何需要新的产品/架构决策。
- 会话记忆、任务记录和长期记忆同步。

## 完成结论

明确死代码已按四项判死标准闭合。剩余 file runtime、migration/trigger、backup/importer 和项目删除 purge 均有责任证据；其中项目删除缺少标准运行时消费/最终 purge 调度，作为独立功能接线风险保留，不通过误删实现来隐藏问题。
