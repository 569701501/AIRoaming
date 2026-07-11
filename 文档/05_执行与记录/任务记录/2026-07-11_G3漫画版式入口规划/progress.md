---
doc_id: AIR-TASK-20260711-G3-COMIC-FORMAT-PROGRESS
status: completed
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md
---

# G3 漫画版式入口与不可变约束推进记录

## 2026-07-11

- 用户确认继续 G3 D1 开发级文档。
- 使用 `$deep-think` 管理跨前端、共享契约、服务、数据库、迁移和下游兼容的规划。
- 用户澄清：现有项目库已经有“创建项目”按钮和 `CreateProjectModal.vue`；G3 只在现有弹窗补字段，不新增入口、页面或向导。
- 本轮边界固定为只写文档，不修改 schema、migration、业务代码、数据库或真实 workspace。
- 已读取 ADR-0009、D1、G0/G1/G2 相关方案和验收文档。
- 已审计现有创建弹窗、项目库调用、共享枚举/DTO、ProjectsController/Service、旧文件 repository、出图准备、候选尺寸和旧排版服务。

## 当前结论

- 当前创建弹窗只有项目名称；原按钮、弹窗、提交调用和创建后进入剧本阶段的链路均可直接复用。
- `CreateProjectRequest.comicFormat` 仍可选，服务端缺失/非法时会静默回退 `vertical_scroll`。
- `UpdateProjectDraftRequest` 和服务仍允许写 `comicFormat`；未建立 HTTP body allowlist 或数据库不可变硬约束。
- canonical enum 仍是 `vertical_scroll/page_horizontal/four_panel`，前后端多处重复 label 和分支。
- 旧 repository 与 preflight 读取也会静默回退，必须与运行时 strict parser 分离为 migration-only mapper。
- 候选尺寸和 LayoutPage 仍绑定旧枚举；G3 需要临时兼容适配，但不提前实现 G5 LayoutDocument。
- 已新增并在用户确认后转为 `accepted` 的正式文档：
  - `文档/04_方案与决策/2026-07-11_G3漫画版式入口与不可变约束开发方案.md`
  - `文档/04_方案与决策/2026-07-11_G3漫画版式契约与旧值迁移字典.md`
  - `文档/06_测试与验收/G3漫画版式入口与锁定验收清单.md`
- 已明确普通 PATCH 只要出现 `comicFormat` 即 409；同值也拒绝，整请求不做部分更新。
- 已明确 completed audit run 不原地补 resolution；用户决议进入带新 `decisionsDigest` 的新 MigrationRun。
- 已明确 `paged_comic` 不等于横屏；当前 3:2 候选尺寸和 `LayoutPage.page_horizontal` 只作为 `legacy_generation_default_v1`/legacy adapter，G5 删除。
- 已同步 README、AI 上下文、产品范围/UI、数据模型、系统架构、模块依赖、七阶段路线和测试入口。

## Handoff

- 用户已于 2026-07-11 确认三份 G3 文档，主方案、契约字典和验收清单均为 `accepted`。
- 文档确认不等于开发授权；实现尚未开始。

## 验证记录

- 22 份 G3 新增/同步/记忆文档检查：奇数代码围栏 0、尾随空格 0、重复 doc_id 0。
- 17 份正式/上位文档的真实本地 Markdown 引用缺失 0；模块模板中的 `<模块中文名>` 占位不作为缺失引用。
- `git diff --check` 通过。
- `git status --short` 未发现 `文档/` 之外的改动。
- `文档/记忆/MEMORY.md` 为 120 行，未超过 500 行。
- 本轮是文档规划，未运行应用 typecheck/test/页面验收，未伪造运行证据。
