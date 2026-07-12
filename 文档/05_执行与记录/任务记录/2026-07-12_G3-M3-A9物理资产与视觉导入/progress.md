---
doc_id: AIR-G3-M3-A9-PROGRESS-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: A9 实现与验证
---

# 进度

- [x] 新增 `AssetVisualShadowImporter`。
- [x] 校验快照物理文件 digest、bytes、MIME 和图片尺寸。
- [x] 通过显式 `workspaceRoot` 将文件安全落盘到目标 storageKey。
- [x] staged→ready，并建立 CharacterVisual/SceneVisual 与 current 指针。
- [x] A9 定向集成通过：2 Asset、1 CharacterVisual、1 SceneVisual、replay 零新增。
- [x] 全量 server 回归通过：44 个测试文件、247 项测试。
- [x] typecheck 与 G1 manifest/schema/migration 三项门禁通过；缺 workspaceRoot 返回 `MIGRATION_WORKSPACE_ROOT_INVALID`；final 继续返回 `MIGRATION_FINAL_IMPORT_NOT_READY`；`git diff --check` 通过。
- [x] 提交本轮代码：`58d84eb`。
