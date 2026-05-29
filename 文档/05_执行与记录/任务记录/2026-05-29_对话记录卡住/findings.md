# 对话记录卡住问题发现

---
doc_id: AIR-TASK-2026-05-29-DIALOGUE-STUCK-FINDINGS
status: active
created: 2026-05-29
updated: 2026-05-29
owner: AI漫游项目
audience: human, ai-agent
source: 用户反馈与代码探索
---

## 1. 需求理解

用户看到的“默认对话记录没显示出来”指进入页面时左侧对话框只显示空状态开场，而没有加载已有线程消息；“再次对话记录突然显示出来”说明后续发送路径会拿到或合并线程；“第二遍发送的一直在转圈”说明某条 assistant 消息保持 `running` 状态，没有被失败或中断处理收敛。

## 2. 研究发现

- 前端 `workbench-store.refresh()` 原本并行请求 workbench 和 dialogueThread。若 URL 没有显式 `chapterId`，dialogueThread 会用旧的 `activeChapterId = null` 加载 `projectId + project_story` 项目级线程；workbench 返回后才把 `activeChapterId` 更新为当前章，导致页面初始只显示空状态。
- 用户再次发送普通章节对话时，前端已经有 `activeChapterId`，会进入 `projectId + project_story + chapterId` 章节线程，所以旧记录会突然显示出来。
- 后端 SSE controller 原本只在 response close 时设置 `closed = true`，没有 abort 正在执行的 `DialogueService.streamMessage` / OpenCode 请求。浏览器刷新或 fetch abort 后，服务端可能继续卡在 OpenCode 调用；如果没有正常完成，线程中的 assistant 消息会长期保持 `running`。
- `DialogueService.getProjectThread` 原本直接返回线程，没有收敛历史遗留的非活跃 `running` assistant 消息。

## 3. 假设

1. 如果刷新时先读取 workbench 并解析当前章节，再加载对话线程，则默认空状态问题会消失。
2. 如果 SSE close 能向 OpenCode 请求传播 AbortSignal，则页面刷新/离开不会留下长时间运行的后端请求。
3. 如果读取线程或创建新 turn 前收敛没有活跃流式请求的旧 `running` assistant 消息，则“再次发送后旧记录突然出现但一直转圈”的问题会消失。

## 4. 证据

- 修改后 API 冒烟：创建临时项目，向当前章节线程发送流式“帮我找灵感”，读取 `dialogue.message.created` 后主动 abort 客户端请求，再读取章节线程；结果 `runningCount = 0`，assistant 消息为完成态失败说明，项目级线程消息数为 0，证明章节线程与项目级线程确实不同。
- 该冒烟同时验证：如果前端误读项目级线程，会看到空记录；按当前章节加载时能看到章节线程消息。
- `git diff --check` 通过，未发现空白格式问题；未留下 `[DEBUG-...]` 或临时 console 调试输出。

## 5. 复核结论

修复方向成立：问题不是单纯 OpenCode 速度慢，而是“刷新加载线程时机错误 + SSE 中断没有状态收敛”的组合。当前修复不解决服务重启后的对话持久化，那仍是后续能力。
