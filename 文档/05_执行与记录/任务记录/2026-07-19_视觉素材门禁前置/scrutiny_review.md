# Scrutiny Review：视觉素材门禁前置

---
doc_id: AIR-TASK-20260719-VISUAL-PREFLIGHT-SCRUTINY
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、ADR-0018、最终代码差异与自动测试
---

## 1. 复核结论

通过，无阻断问题。

实现已经把“剧情结构确定素材要求、分镜只引用结构主体、出图准备验证同一要求”收口为一条可执行契约，没有通过出图准备页面增加补图或修复能力。

## 2. 静态检查

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 共享分类规则 | 通过 | `packages/shared/src/character-visual-policy.ts` 是前后端共同事实源 |
| 出镜次数不再升级要求 | 通过 | 生产代码中无 `appearanceCount > 1` 素材判定；该字段只保留展示 |
| 非人物主体处理 | 通过 | creature/group 固定 preview，voice 固定 none；服务端拒绝不适用 final 请求 |
| 出图准备纯门禁 | 通过 | 页面只有检查、查看角色库和确认；无生成、定稿或自动补齐动作 |
| 分镜引用范围 | 通过 | 生成引用解析和 DB Storyboard 持久化均拒绝当前结构外角色 |
| 来源与历史兼容 | 通过 | 新写 `preflight-source-v2`；v1 可解析但生产状态 stale |
| 群体别名 | 通过 | group 保守身份键；新结构只建一份 Character，旧项目页面合并素材卡，再次确认时逐步回收到同一 Character |
| Prompt 事实源 | 通过 | creature/group 模板位于 `opencodeAI/skills/image-reference-generate/references/`，服务端只做变量装配 |
| 范围控制 | 通过 | 无数据库 migration、无 StoryStructure/Storyboard 字段、无顶部步骤和新页面 |

## 3. 自动证据

- `pnpm test`：Shared 165/165，Server 767/767，共 932 条通过。
- `pnpm typecheck`：通过。
- `pnpm typecheck:e2e`：通过。
- `pnpm build`：通过；只有既有的大 bundle warning。
- DB 模式 Web 门禁 E2E：3/3 通过，使用 fake provider。
- `git diff --check`：通过。

## 4. 非阻断残留

- file 兼容层仍保留历史 `resolveImagePreflightCharacter` 代码，但 DB-only 生产模式已经明确退役该操作，当前页面和生产版本链均不可用它绕过纯门禁。本任务不做兼容 API 清理。
- 当前首版没有通用 `prop/object` 元素模型；复杂道具仍应作为后续单独设计，不借本任务扩表。
- 旧结构正文中的两个 group 文字卡仍保留原始分析内容；视觉素材投影只显示一份，下一次正式确认会把别名映射收敛，不静默改写历史版本。
