---
doc_id: AIR-D2-A2-2-SCRUTINY-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: reviewer, developer, qa
source: A2-2 static scrutiny
---

# Scrutiny Review

## 结论

通过。A2-2 只收口 legacy clear/import/reset 的安全退役，没有把拒绝伪装成实现，也没有修改 G1 schema、migration、trigger 或 formal history。未发现 P0/P1 问题，可以独立提交并进入 D2-A3-1。

## 静态核对

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| retired 元数据完整性 | PASS | registry validation 要求 reason、replacement、evidenceTestIds |
| 7 个旧写入口 | PASS | clear_project_chapters、clear_legacy_story、clear_chapter_script、confirm/discard pending、import_script_to_chapters、reset_project_script |
| 稳定拒绝 | PASS | `LEGACY_WRITE_ROUTE_DISABLED` + HTTP 409 + operation/reason/replacement |
| replacement 入口 | PASS | impact preview、逐章 Working Copy CAS、pending adopt/discard |
| 历史保护 | PASS | A2-2 代码未删除 Chapter/ScriptVersion/Outline/下游历史；整树 clear/import/reset 不再执行 |
| capability 语义 | PASS | 8 capabilities、36 operations、project aggregate implemented、blockedIds=5，其余 blocker 未改变 |
| schema/G1 边界 | PASS | 无 Prisma/schema/migration/trigger/G1 generator 修改 |

## 测试证据

- 定向：`project-db-persistence.integration.spec.ts` + `db-capability-registry.spec.ts`，20/20 通过。
- server 全量：54 个文件、361 个测试通过。
- 静态门禁：workspace typecheck、web build、Prisma validate、G1 manifest/schema/migration check、`git diff --check` 全部通过。

## 残留风险

- 物理清空和整文件导入仍然不可用，这是刻意的安全退役，不是遗漏；需要后续产品能力时必须沿逐章 CAS/新章节路径提出新的阶段契约。
- 其他 5 个 capability blocker 未被本阶段触碰，必须保持原证据门禁。
