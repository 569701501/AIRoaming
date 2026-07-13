---
doc_id: AIR-D2-A2-2-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-2 Handoff、G2 CAS 契约
---

# 实施契约

## 退役状态

`DbCapabilityOperation.writeStatus` 增加 `retired`。每个 retired 必须具备 `retirementReason`、`replacement`、稳定拒绝测试和 replacement 成功测试；普通 unsupported/409 不得计为关闭。

## replacement

- `clear_chapter_script`：`DELETE /projects/:projectId/chapters/:chapterId/script/working-copy`，提交 observed digest/rowVersion。
- 旧 pending confirm/discard：G2 pending suggestion adopt/discard，保留 revision，adopt 不创建 ScriptVersion。
- `clear_project_chapters`、`clear_legacy_story`：DB 模式退役，零 workspace 副作用；逐章 Working Copy clear 是替代。
- `import_script_to_chapters`：退役整文件覆盖；逐章 pending/Working Copy 是替代。
- `reset_project_script`：退役隐式重置；逐章 clear 或新建章节是替代。

## 安全边界

稳定响应为 HTTP 409 `LEGACY_WRITE_ROUTE_DISABLED`，details 必须包含 operation、replacement、reason。file mode 旧行为不变。不得把拒绝本身写成 implemented；只通过 registry 的 retired 规则关闭 operation。
