---
doc_id: AIR-D2-A2-1-FINDINGS-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 当前代码、schema、trigger 与 D2/G2 文档核对
---

# D2-A2-1 Findings

## 已验证事实

1. `ProjectPersistenceWrite` 当前只支持 `create_project/save_chapter_draft/complete_chapter`；其他 LocalProject whole-tree 写在 DB 模式 fail-closed。
2. G2 `ScriptVersionRepository` 已实现 Working Copy update/clear/revert、publish、pending adopt/discard 和 history；但没有 runtime pending create 命令。
3. Web 仍调用旧 `draft/complete/source-pending/script-clear` API，且 `WorkbenchSnapshot` 尚未携带已批准的 `VersioningCapability`。
4. `ProjectRepository` 在启动时把 DB 投影加载到 identity map；versioning repository 直接写 DB 后没有主动刷新该 map。
5. `SaveScriptOutlineFromAIInput` 已携带 thread/message/toolCall，可作为稳定命令身份；`confirmScriptOutline()` 当前没有 expected ID，存在确认错版本风险。
6. 批量章节生成当前对所有章节复用一个 toolCallId；若 Conversation FK 已存在，会与 `ChapterScriptRevision(threadId, toolCallId)` unique 冲突。
7. runtime Dialogue 目前不持久化 ConversationThread/Message；pending/revision 的可选 FK 必须允许 null，不能伪造行。
8. `Chapter` 无 retirement 字段；物理删除、milestone 回退和 formal history 改写均被 trigger/约束禁止，因此旧 reset/import/clear 不能直接照搬。

## 已形成决策

- A2-1 预期 0 schema change。
- `ChapterScriptPending` 是 AI 正文建议事实源；创建时不改 Working/current/title。
- Project outline 用 append-only draft + expected-ID confirm。
- Web 根据 runtime capability 双模式运行，M6 前不移除 file-mode bridge。
- A2-1 完成后 capability 仍阻塞，blockedIds 不变。

## Worker 已验证

- confirmed outline -> archived 的状态变更在 fresh SQLite 主链路通过；旧 confirmed 正文未改写。
- ProjectRepository 和 ScriptVersionService 在 DB mutation 后主动 refresh identity map；同进程、重启和 workspace 伪文件隔离均通过。
- Web 只改 API/store 即接入 modern Script Working Copy/Pending；组件公开 props 未扩大。

## 当前风险

- 如果 Worker 用 click-time GET 最新 rowVersion 再写，会让 CAS 看似存在但双客户端保护失效。
- 如果 Worker直接启用旧 Service 写路径，会违反 G2 已批准的 legacy fail-closed 契约。
- 如果把旧 workspace 文件测试当 DB 写证据，会重复 D2-A0 已明确禁止的证据错误。

## A2-1 实现偏差与风险

- 既有 SQLite check constraint 不允许“仅 toolCallId 存在、thread/message 缺失”的组合；实现选择三者全 null，符合“不伪造 Conversation 行”和数据库硬约束，但在 D2-A5 Conversation runtime 接入前无法持久化缺失命令的 toolCallId。确定性 ID 仍用于重放与冲突判定。
- G2 publish 的 next chapter ID 已改为 `{projectId}_chapter_{order}`，保证公开 ensure/publish 生成的章节身份稳定且可重启复用。
- Web DB 完成动作把当前观察到的 Working Copy CAS 作为 update 输入，再使用 update 响应的 digest/rowVersion publish；没有 click-time pre-read。
