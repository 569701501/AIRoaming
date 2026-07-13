---
doc_id: AIR-D2-A3-2A-SCENE-QUEUE-HANDOFF-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: D2-A3-2A 连续执行
---

# 场景参考任务持久化 Handoff

## 目标

在 DB 模式公开 `queue_scene_reference`，把当前 StoryVersion 的 scene 投影绑定为不可变 source projection，创建可重放的 `scene_reference_generate` GenerationTask；不调用真实 provider、不写用户真实 workspace。

## 已完成

- `ProjectsService.queueSceneReference` 仅在 DB 模式放行，文件模式继续旧门禁。
- 读取 `ChapterScene` 的稳定行身份和 `updatedAt`，生成 `scene-reference-source-v1` digest。
- 同输入重放返回原任务，不重复创建。
- SceneVisual worker 使用 fake handler 验证 staged→ready Asset、SceneVisual 和 currentVisual source fencing。

## 禁止范围

不实现 `generate_scene_reference` 同步旧入口、Character delete、CandidateLock、Layout/Export、Outbox consumer、final importer、M6 或真实 provider/凭据。

## 交付证据

- 定向：`db-capability-registry.spec.ts` + `project-db-persistence.integration.spec.ts`，30/30 PASS。
- 全量：server 54 files / 371 tests PASS。
- 静态：typecheck、Web build、Prisma validate、G1 manifest/schema/migration checks PASS。
