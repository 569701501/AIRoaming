---
doc_id: AIR-D2-A3-2A-CHAR-TASK-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: Character task persistence
---

# 测试矩阵

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| P4-CHAR-03 | queue task | task queued、target Character、source sealed |
| P4-CHAR-04 | source freeze | source row 是 Character digest，非 workspace 内容 |
| P4-CHAR-05 | replay | 相同 prompt/referenceKind 返回原 task，不重复 GenerationTask |
| P4-CHAR-06 | safety | 不调用 provider，不写 Asset/Visual/物理文件 |
