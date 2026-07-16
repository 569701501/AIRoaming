---
doc_id: AIR-TASK-20260716-STORYBOARD-S3-SCRUTINY
status: passed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 代码差异、数据库版本链、模型会话与自动化回归
---

# Scrutiny Review

结论：`passed`。

## 静态与数据复核

1. 两路分镜均从当前正式 StoryVersion 进入统一服务，不按 Script `origin` 分支 Prompt；`build → parse → quality gate → reference resolve` 顺序一致。
2. 两个 StoryboardVersion 的 `sourceStoryVersionId` 与生成时 current StoryVersion 完全一致，两个 StoryVersion 也精确绑定各自正式 ScriptVersion。
3. 生成结果先进入 Working Copy；确认前 current StoryboardVersion 为空，确认后才发布并推进章节。没有 pending 越权成为正式版。
4. AI 章节来源修复只在 thread/project/chapter/message 同域时保存对话审计 ID；不满足时保存空审计引用，但保留已密封的大纲、章节卡和前章正式版本来源。
5. OpenCode 权限修复覆盖新会话和旧会话：新建时 deny-all，每条消息再用 `tools={"*":false}` 重置。应用内业务工具在模型调用前执行，因此该限制不会切断正式产品动作。
6. 没有 Schema、migration、页面字段或用户确认流程变化；未调用图片 provider。

## 自动化复核

- OpenCode 权限、来源摘要和真实 SQLite 来源作用域：3 files / 7 tests 通过。
- Server typecheck：通过。
- Server 全量：114 files / 681 tests；2 项只在并发负载下命中既有 5 秒超时，隔离重跑均在 1.8 秒内通过。
- `git diff --check`、文档路径和最终工作树在提交前再次检查。

## 剩余风险

- 真实模型证据只有两个样例；不能推导为跨题材稳定率或商业质量评分。
- Server 两个重型测试仍存在并发 5 秒超时稳定性债，虽然与本次改动无关且隔离重跑通过。
- S4 图片质量仍未验收，必须保持“未授权、未调用、未通过”的明确口径。
