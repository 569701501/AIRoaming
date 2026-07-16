---
doc_id: AIR-TASK-20260716-STORYBOARD-S1-FINDINGS
status: completed
created: 2026-07-16
updated: 2026-07-16
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 分镜生成契约 S1 代码与契约复核
---

# findings

## 契约

- 生产分镜模型输入：当前已确认 StoryVersion、正式章节正文必要摘录、用户本次要求；调整时额外输入当前 pending Storyboard。
- AI 输出：beatId、sceneId 使用 StoryStructure 原有 ID；characterIds 与 voiceLines.characterId 使用 StoryStructure 角色卡 ID；新 Shot 不拥有数据库 ID。
- 后台：角色卡 ID/角色名映射为 projectCharacterId；新 Shot 通过 G2 createPendingShot 分配稳定 ID；最终文档再进入严格 Storyboard V2 codec。
- 数据库：只保存正式 Shot ID、Project Character ID 以及已确认 StoryVersion 来源。

## 运行时事实

- `apps/server/opencodeAI/README.md` 明确说明该目录尚未接入完整运行时模板复制，因此现阶段新增 `SKILL.md` 会成为孤立资产。
- Web 的 DB Storyboard 保存路径会直接把 legacy `shot_001` 传给严格仓储，仓储要求 Shot 行已存在，会返回 `SHOT_ID_UNKNOWN`。
- `StoryboardDialogueService` 的 legacy save/confirm 在 DB mode 会被 ProjectsService 主动拒绝。

## 最终结论

- 分镜生成的事实源必须是当前已确认 StoryVersion 及其精确绑定的正式 ScriptVersion，不能使用页面中尚未发布的正文编辑内容。
- AI 的结构本地引用和数据库正式 ID 是两层不同契约；AI 不应猜 UUID，后台也不应靠 normalize 静默猜名称。
- 页面手动新增镜头与 AI 新增镜头最终都必须经过同一稳定 Shot ID 分配接口，否则严格 Storyboard V2 仓储会拒绝保存。
- “调整分镜”是对当前 pending 的完整替换，不是修改正式版本；没有 pending 时必须明确失败。
- S1 只把质量规则写入 Prompt，尚未把覆盖、重复和 comic/motion 一致性做成固定 Validator；该缺口属于 S2。
