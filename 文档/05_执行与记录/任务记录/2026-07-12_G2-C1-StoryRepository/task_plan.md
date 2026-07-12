---
doc_id: AIR-G2-C1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2 施工包与当前代码库
---

# G2-C1 StoryVersion Repository 任务计划

## 目标

在 Script current + clean、无 AI pending 的门禁下，完成 Story Working Copy 的 pending create/update/discard/confirm 手工闭环，使用 V2 Story codec、Chapter CAS、Story projection 和 confirmed current pointer；不实现 Story parse worker、Storyboard command 或 Preflight。

## 阶段

1. 冻结 Shared Story API 类型与空文档/summary 映射。✅
2. 实现 StoryVersionRepository 的 pending CRUD、projection rebuild、confirm source gate。✅
3. 接入 Story API facade 与新路由，保留 G1 旧路径。✅
4. fresh SQLite 验证 create/update/discard/confirm、CAS/replay、source stale、重启读回。✅
5. 完成 scrutiny、handoff、文档和长期记忆同步。✅

## 退出标准

- pending Story 只在 current Script clean、无 ChapterScriptPending 时创建/确认。
- Story document 严格按 V2 codec 校验，scope/Character 解析失败不写库。
- confirm 在同一事务完成 projection、pending→confirmed、Chapter current/pending pointer 切换和 rowVersion CAS；历史 Story 不被改写。
- fresh SQLite、全量测试、类型检查和 migration/manifest 检查通过。
