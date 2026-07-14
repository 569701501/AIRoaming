---
doc_id: AIR-G05-W1-SCRUTINY-001
status: passed
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: reviewer, luna, human
source: W1 DB-only Web/API implementation and test evidence
---

# W1 Scrutiny Review

## 结论

`passed`。本次静态复核确认 W1 只增加 DB-only Web/API 路径，没有把 DB 失败隐式回退到 legacy file 写路径；重复 Preflight confirm 路由已收敛为一个；W1 代码、测试和证据可以独立提交。

## 核对项

- `projects.controller.ts` 的 `POST :projectId/chapters/:chapterId/image-preflight/confirm` 装饰器唯一；DB/file 由 `ProjectsService.usesDatabasePersistence()` 明确分派。
- Web DB 分支只调用 versioning API；409 经过 `refreshAfterVersionConflict()` 刷新服务端状态并提示重新确认，不覆盖本地编辑内容，也不调用 legacy fallback。
- Story/Storyboard 历史复制先校验 current pointer、chapter rowVersion、无 active pending，再新增 immutable pending version；历史行不更新。
- DB E2E 使用 fresh SQLite 和正式 migration；file-mode E2E 仍保留。
- W1 文件集合与用户已有 M6/其他历史文档改动分离，提交时禁止 `git add -A`。

## 已知未覆盖项

- 双标签冲突的完整浏览器交互仍需后续增强；当前 server CAS、409 UI 提示和 DB integration 已有证据，不能把它描述成完整双标签 Runtime 通过。
- 本 Review 不代表 R0B/R1/R2 或真实数据切换获授权。
