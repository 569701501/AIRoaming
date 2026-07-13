---
doc_id: AIR-D2-A3-2A-CHAR-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa
source: Character identity slice
---

# 测试矩阵

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| P4-CHAR-01 | update identity | DB Character 更新、rowVersion+1、response 可读 |
| P4-CHAR-02 | legacy isolation | workspace marker 字节不变，DB refresh 后 DTO 取 DB 事实 |
| P4-CHAR-03 | forbidden state | in_use/duplicate name 稳定拒绝 |
| P4-CAP-01 | capability | update_character implemented，其余 Character/Asset operation blocker 不变 |
