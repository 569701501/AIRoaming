---
doc_id: AIR-G3-M3-A9-PLAN-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer
source: G1 Asset/Visual 契约与 G3-M3 施工包
---

# G3-M3-A9 物理资产与视觉导入计划

## 目标

读取 sealed snapshot 中 `shared/assets.json` 引用的物理文件，校验字节摘要、MIME 和图片尺寸；在显式目标 workspace 中完成 staged→ready，再导入 CharacterVisual/SceneVisual。

## 边界

- 没有显式目标 workspace、物理文件缺失或图片尺寸不可读时，不创建 ready 或视觉关系。
- 只使用快照中已有的 Character/ChapterScene/Asset 稳定 ID；不猜测 Task 外键。
- Character current 指针仅指向 available visual，Scene current 指针仅指向 ready Asset 的 SceneVisual。
- `db:import --kind final` 继续 fail-closed。

## 退出标准

- 集成测试覆盖物理 hash/bytes/尺寸、目标文件落盘、ready promote、CharacterVisual、SceneVisual、current 指针和 replay。
- typecheck、server 全量测试、G1 三项门禁、CLI 参数边界和 diff check 通过。
