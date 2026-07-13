---
doc_id: AIR-D2-A3-2A-CHAR-WORKER-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: Character worker
---

# 测试矩阵

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| P4-CHAR-04 | fake handler worker promote | task succeeded、Asset ready、CharacterVisual available、文件字节一致 |
| P4-CHAR-05 | identity source changed after queue | task applicability=historical，visual 可审计但不更新 preview 指针 |
| P4-CHAR-06 | provider boundary | 测试只注入 fake handler，不读取真实 provider 配置 |
