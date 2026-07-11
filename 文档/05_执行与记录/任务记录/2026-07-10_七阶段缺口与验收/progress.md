---
doc_id: AIR-TASK-20260710-SEVEN-STAGE-GAP-PROGRESS
status: active
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 七阶段能力缺口与完整链路验收推进记录

## 2026-07-10

- 用户确认下一步只梳理现有七阶段的真实缺口、升级能力和完整链路验收，不重新设计阶段框架。
- 使用 `$deep-think` 建立独立任务记录；本轮只读审计代码与真实数据，输出正式方案，不进入功能开发。
- 已确认现有共享契约、前后端 workflow、顶部步骤门禁和各阶段用户动作构成现有七阶段推进基线。
- 已逐阶段核对前端组件、Pinia action、Controller、业务 Service、Repository 落盘、共享 DTO、真实 workspace 和现有测试。
- 已识别 P0 事实一致性问题：完成后的剧本/结构再次编辑时，版本 current 指针、章节状态和下游 freshness 不统一；旧正式产物可能仍保留并暴露。
- 已确认分镜新增/删除/拖拽重排、章节级对话 key、真实候选生成、批次和出图准备来源校验已经存在，不进入重复开发清单。
- 已确认后半段真实缺口：D3 修订式定稿未实现；排版只是一镜一页复制源图；素材包是不可下载目录；项目状态投影不能表达后半段；任务仍在内存。
- 已新增 `2026-07-10_七阶段能力缺口与升级顺序.md`，按 G0–G7 排定依赖。
- 已新增 `七阶段完整链路验收基线.md`，覆盖正常路径、门禁、上游返修、A→B 换图、任务重启/取消/重试、渲染、ZIP 和 manifest 审计。

## 验证记录

- 只读检索：`rg`、`nl`、`jq`、`find`。
- 真实 workspace：workflow 当前为 `image_candidates`；前四步 done；15 镜头、27 候选、0 锁定；无 layout/export/package 文件。
- 上一轮当前代码验证：`corepack pnpm test`，shared 15 项 + server 64 项通过；`corepack pnpm typecheck` 三包通过。
- 本轮未运行真实页面写操作，避免改变用户 workspace；Runtime/User Review 保留给后续验收。
- `corepack pnpm test` 再次通过：shared 15 项、server 64 项；`corepack pnpm typecheck` 三包通过。
- `git diff --check`、frontmatter/doc_id、关联 ADR 和文档路径检查通过；`apps/`、`packages/`、`workspace/` 无本轮改动。

## Scrutiny Review

**结论：文档级静态复核通过，等待用户确认。**

- 方案没有重建七阶段 workflow，也没有把自动调度、轻漫剧、R5 或 Prompt 详细实现混入当前范围。
- D1、D3、D4/D5、D7 分别沿用 ADR-0009/0010/0011/0012，没有退回静默默认、只改指针、复制源图或双主源方案。
- 代码证据、真实 workspace 断点、现有测试边界和方案成熟度表一致。
- G0–G7 顺序先保行为证据、再切事实源、再做版本/修订/成稿/交付，依赖方向成立。

### 残留风险

- 尚未执行真实页面点击路径；这是本轮只写文档的有意边界。
- Web E2E 工具、D4/D5 编辑/渲染内核和 SecretStore 跨平台实现仍需各自原型或开发级文档确认。
- 当前正式方案为 `proposed`，用户确认前不得创建实现分支或修改业务代码。

## Handoff

### 完成

- 任务范围、事实审计、正式缺口方案和验收基线已完成。
- 2026-07-11 用户确认继续 G0；总方案任务已完成并交接到独立 G0 任务记录。

### 未完成

- 实现后的真实 Runtime/User Review，由 G0–G7 各任务承担。
