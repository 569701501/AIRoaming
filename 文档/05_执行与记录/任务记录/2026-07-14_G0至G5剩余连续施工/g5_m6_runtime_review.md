---
doc_id: AIR-G05-M6-RUNTIME-001
status: passed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: runtime-reviewer, developer, qa, ai-agent
source: 提交 429ec69 的 fresh SQLite、DB-only 浏览器路径与全量回归
---

# G5-M6 Runtime/User Review

## 结论

`passed`。候选 A 进入草稿后更换为 B，来源替换 preview/commit、Undo/Redo、正式预检、不可变版本、历史查询和恢复到草稿已形成真实 DB-only 用户闭环；M6 可以关闭并进入 M7。

## 真实页面路径

- fresh SQLite 通过真实 G4 路径创建 current CandidateLockRevision A，再更换为 B；旧 Working Copy 保持 stale，页面明确提示需要处理。
- “预览全部”显示 A→B、目标 image ID、crop 处理和“不会改写旧版本”，证据为 `evidence/g5_m6_source_replacement_preview.png`。
- 确认提交后 Working Copy 变为 current；一次 Undo 保存后重新派生 stale，一次 Redo 保存后恢复 current，正式版本数量仍为 0。
- 正式预检完成后，所有 warning 必须逐项勾选才允许保存；保存创建 revision=1、previous=null、sealed SourceBinding 与 Chapter current pointer。
- 新增段落只改 Working Copy；“恢复到草稿”恢复版本 1 文档后，Chapter currentLayoutRevisionId 保持版本 1，没有改历史。
- DB 复核 SourceBinding `sourceDigest` 为有效复合 sha256 且不等于 Asset 原始 sha，证明 0014 修复的是错误比较而非降低来源门禁。
- 页面 `pageerror=[]`；最终历史截图为 `evidence/g5_m6_repair_revision_history.png`。

## 自动化门禁

- Shared：21 files / 104 tests；Server：87 files / 551 tests。
- 全仓 typecheck、E2E typecheck、Prisma validate 与 diff check 通过。
- E2E 环境合同 33/33；file 4/4；DB 6/6。
- M6 Undo/Redo 修复后的 DB-only 定向复跑 1/1；Revision unknown acknowledgement 定向集成通过。
- `test:render` 仍按设计保留 M7 renderer/browser semantics 红灯；`test:migration:g5` 的 legacy 红灯仍归 M8。

## 隔离与副作用

运行使用受标记临时根、fresh SQLite、loopback fake provider 和隔离 Chromium。没有删除 backup/archive，没有执行 down migration，没有 file-only 回退，没有进入 G6/视频，没有 push。
