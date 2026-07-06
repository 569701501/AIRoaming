# 任务计划：候选图工作台 MVP

---
doc_id: AIR-TASK-IMAGE-CANDIDATES-PLAN-001
status: in_progress
created: 2026-07-06
updated: 2026-07-06
owner: AI漫游项目
audience: human, ai-agent, developer
source: 文档/04_方案与决策/2026-07-06_候选图工作台MVP方案.md
---

## 1. 目标

实现第 5 步候选图工作台 MVP：分镜 → 候选图生成（默认 2 张）→ 锁定/跳过/废弃 → 完成候选图 → `images_done`。数据落 `candidates.json` 文件态，prompt 程序拼装（系统级模板可配置），单参考图图生图。

## 2. 非目标

见方案文档第 2.2 节：多参考图、LLM prompt、多角色一致性、Prisma 启用、shot 级失效、停止生成、对话受控工具。

## 3. 阶段划分

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P1 契约 | shared DTO（CandidatesJson 等）、prompt 拼装纯函数 + 单测、settings 增 imagePromptTemplate | in_progress |
| P2 后端 | ImageTaskQueue 抽取、candidates 读写 service、image_generate worker、candidates API、confirm → images_done | done |
| P3 前端 | ImageCandidatesWorkspace.vue、路由、SSE 进度、锁定/跳过/确认交互 | done |
| P4 收尾 | 文档同步（方案第 6 节清单）、功能完成记录、端到端验证 | in_progress |

## 4. 已做决策

Q1-Q7 全部决策见方案文档第 4 节，不在本文重复。

## 5. 关键问题

- doubao provider 的 size 参数与 openai 不同（见 character-reference.service.ts 的分流），候选图尺寸需按 provider 分流。
- 章节状态推进（images_done）需复用现有 chapter.json 写入与 workflow 推导链路，不另起炉灶。

## 6. 退出标准

方案文档第 8 节 8 条验收标准全部满足，且真实项目端到端跑通一次（Runtime Review 由用户执行）。
