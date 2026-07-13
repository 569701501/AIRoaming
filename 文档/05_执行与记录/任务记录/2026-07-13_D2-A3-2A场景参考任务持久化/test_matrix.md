---
doc_id: AIR-D2-A3-2A-SCENE-QUEUE-TEST-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, reviewer
source: 场景参考任务持久化 Handoff
---

# 测试矩阵

| ID | 验证 | 结果 |
| --- | --- | --- |
| P4-SCENE-01 | 正式 Script/Story repository 建立 current scene，queue 创建 task、sealed source、replay | PASS |
| P4-CHAR-08 | fake handler 完成 scene task，Asset staged→ready、SceneVisual/currentVisual | PASS |
| CAP-02 | capability operation 有 owner/status/evidence，queue_scene_reference=implemented | PASS |
| FULL-SERVER | 54 个测试文件、371 条 | PASS |
| STATIC | typecheck、Web build、Prisma、G1 manifest/schema/migration | PASS |

所有测试使用 fresh SQLite、fake handler 或 repository fixture；没有真实 Keychain、provider、workspace 或用户数据。
