---
doc_id: AIR-G2-D1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G2-D1 施工资料与当前代码库
---

# G2-D1 StoryboardVersion Repository 任务计划

## 目标

在 C1 confirmed Story current、Script clean、无 Story pending/AI pending 的门禁下，完成 Storyboard pending create/update/discard/confirm、stable Shot create、projection 和删除镜头的 retired 闭环；不实现 `shot_generate` worker、Candidate、Preflight 或持久任务。

## 阶段

1. 读取 D1 事务地图、API/幂等契约、overlay trigger 和 Storyboard V2 codec。✅
2. 新增 Shared Storyboard contract、stable Shot request/response。✅
3. 实现 StoryboardVersionRepository pending CRUD、stable Shot、projection、confirm/retire。✅
4. 接入 StoryboardVersionService、ProjectsController DB-only 路由和 ProjectsModule。✅
5. fresh SQLite 验证 source gate、requestId replay、projection、confirm、retire。✅
6. 完成 scrutiny、handoff、功能记录和长期记忆同步。✅

## 退出标准

- Storyboard pending 的 sourceStoryVersionId/sourceDigest 固定绑定 current Story。
- 所有 pending/Chapter 写入使用 rowVersion CAS；stable Shot ID 由 shared stableShotId 算法派生，重复 requestId 不重复建镜头。
- confirm 在 pending parent 上重建 Shot projection，移除 current Shot 时只允许 active→retired，不复活旧 ID。
- fresh SQLite、全量测试、类型检查和 migration/manifest 检查通过。
