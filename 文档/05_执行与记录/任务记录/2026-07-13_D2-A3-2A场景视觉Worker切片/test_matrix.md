---
doc_id: AIR-D2-A3-2A-SCENE-WORKER-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: SceneVisual worker
---

# 测试矩阵

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| P4-SCENE-01 | fake handler promote | Asset ready、SceneVisual available、currentVisual 切换 |
| P4-SCENE-02 | source fencing | digest 变化时不切 currentVisual |
| P4-SCENE-03 | provider boundary | 不读取真实 provider 配置 |
