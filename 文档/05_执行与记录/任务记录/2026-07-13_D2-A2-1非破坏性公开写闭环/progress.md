---
doc_id: AIR-D2-A2-1-PROGRESS-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-1 task plan
---

# D2-A2-1 进度

## 2026-07-13 Worker：A2-1 实现与验证

- 新增 `ProjectScriptCommandRepository`、确定性 runtime command ID、DB identity-map refresh；metadata、ensure chapter、AI pending/revision、outline draft/confirm 已接入 DB 事务。
- G2 Script mutation 完成 service refresh；旧 draft/complete/source-pending 路由在 DB 模式统一 409 `LEGACY_WRITE_ROUTE_DISABLED`，file mode 保持旧行为。
- `WorkbenchSnapshot.versioningCapability` 与 Web Script 双模式 API/store 已接线；DB pending 采用/丢弃不创建 ScriptVersion，publish 才创建历史版本。
- fresh SQLite 集成 14/14 通过；定向项目/registry 测试 27/27 通过；遗留 shadow API 测试 58/58 通过。
- 全量 server 复跑：54 files / 360 tests 全绿；旧 shadow API 已改为 G2 Working Copy。

## P1 D2-A2-1 收口（2026-07-13）

- Scrutiny Review 与 Runtime/User Review 均 PASS，证据已写入本任务目录。
- server 全量 `54 files / 360 tests` PASS；workspace typecheck、web build、Prisma/G1 门禁、diff check PASS。
- P1 完成后 `blockedIds` 仍精确为 6；下一阶段为 D2-A2-2，范围仅限 clear/import/reset 的安全 replacement 与 legacy 退役语义。
- workspace typecheck、web build、Prisma validate、G1 manifest/schema/migration check、`git diff --check` 已通过。
- capability 只将 5 个目标 operation 标为 implemented；两个聚合 capability 仍 partial，`blockedIds` 精确为 6。
- 已知 schema 约束：`ck_chapter_script_pending_tool_source_shape` 要求 thread/message/toolCall 三者同存或全空；缺失 Dialogue FK 时按正式约束三者写 null，不伪造 Conversation 行。

## Worker 更新格式

后续每次只在 todo/证据变化时增加一节，至少记录：

```text
日期时间 / 角色
完成的 test ID
修改文件
实际命令与结果
尚未满足的退出门
是否触发停止条件
```
