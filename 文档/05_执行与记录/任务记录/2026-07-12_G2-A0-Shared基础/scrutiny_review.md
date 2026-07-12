---
doc_id: AIR-TASK-G2-A0-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G2-A0 Shared 实现与验证
---

# Scrutiny Review

## 静态检查

- `packages/shared/src/versioning/` 无 Node `crypto`、Prisma、Nest 或文件系统依赖；通过三包 typecheck。
- Shared 入口只增加 `versioning/index.ts` 导出；未修改数据库、Controller、worker、UI 或现有 V1 DTO 行为。
- `git diff --check` 通过，未发现空白错误。

## 契约检查

- canonical JSON 固定对象键顺序、保留数组顺序、拒绝非 JSON 值；严格 parser 拒绝重复键、尾随内容、非有限数字。
- Script 文本执行 BOM/换行/项目级标题规范化后再 digest；Story/Storyboard/Preflight 对 V2 字段执行 exact-key、enum、nullability、ID 唯一性和 order 检查。
- SourceSnapshot generic sources 按 `(role, entityType, entityId)` 的 UTF-8 byte 顺序排序；Preflight character/scene 输入按合同排序并校验 visual/asset/digest 三元组原子性。
- Freshness 纯函数覆盖 current/pending/historical/stale/missing、working dirty/empty/AI pending、source changed/unresolved、policy unsupported 和 upstream stale 传播。
- Stable Shot ID 使用合同固定的 `g2-shot-v1\0` scope/pending/request material，输出 `shot_` 加 32 位小写摘要前缀。

## 测试证据

- Shared：6 个 spec 文件，34 条测试通过。
- Server：25 个 spec 文件，162 条测试通过。
- 全仓 typecheck：shared/server/web 均通过。

## 残留风险

- A0 只提供纯函数和运行时输入类型；Prisma row mapping、Repository、四层写事务、CAS、task applicability 和真实 migration 仍由 A1/B/C/D/E/F 实现。
- Storyboard 跨文档 beat/scene/character 引用通过可选 `StoryboardReferenceContext` 校验；没有上游上下文时只校验引用形状，不能代替服务端 scope 校验。
- RFC 8785 之外的跨语言实现一致性仍需在服务端/浏览器构建产物和后续 golden fixture 中持续保护。

## Runtime/User Review

N/A。该切片没有页面、任务 worker、导出物或用户路径；真实页面和 DB 重启验收留给后续切片。

