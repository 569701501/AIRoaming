---
doc_id: AIR-PROGRESS-20260716-STORY-STRUCTURE-QUALITY
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 剧情结构质量门任务计划
---

# 剧情结构质量门进度

## 2026-07-16

- 阶段：Orchestrator 范围收敛。
- 已确认 A+ 双流程、P1～P6 和真实模型浏览器验收均已完成。
- 已决定下一步落在两条路线共同下游的剧情结构阶段；不增加页面字段和新流程。
- 下一步：完成现有运行时、解析器和测试缺口审查。

### 阶段 1 完成

- 审查了 `buildStoryStructurePrompt`、`parseStoryStructureJson`、`StoryStructureDialogueService`、DB StoryDocument V2 校验和前端确认适配。
- 确认缺口集中在模型输出进入待确认预览前；现有 DB 版本来源和页面确认流程无需修改。
- 下一步进入 Worker：先增加固定正反测试，再实施内部质量门和一次修复。

## Handoff

- 功能已完成并验证，无待执行代码阶段。

### Worker 完成

- 增强剧情结构 Prompt，固定正式正文、大纲边界、逐场覆盖、人物与 beat 引用规则。
- 新增内部质量门和一次格式/质量共用修复预算。
- DB 模式改为先检查 clean Working Copy，再按 current ScriptVersion 读取正式正文；未发布正文不调用模型。
- 修改/新增文件见功能完成记录。

### 验证证据

- 聚焦：3 files / 17 tests passed。
- Server 全量：107 files / 652 tests passed。
- workspace typecheck、E2E typecheck、production build passed。
- DB-only Chromium `W1-E2E-05`：1/1 passed，run ID `g0-83878-mrnaizws-466a9c3e`。
- `git diff --check` passed。

### Scrutiny Review

- 结论：通过。
- 无数据库、DTO、页面、StoryStructure 字段或公开 Skill 变化。
- 固定门只断言可确定的正文覆盖和引用，不冒充完整艺术质量评价。
- DB 正式来源与 `sourceScriptVersionId` 语义一致；dirty/pending/version drift 在模型前阻断。

### Runtime/User Review

- 结论：通过。
- 现有页面“生成剧情结构 → 查看预览 → 确认结构 → 同步角色 → 解锁分镜”路径未回归。
- 本轮无新 UI，因此无需新增截图基线。
