---
doc_id: AIR-TASK-CHAPTER-EDIT-PROMPT-002
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent
source: 代码库探索
---

# 探索发现

## 真实运行链

- `shouldUpdateChapterDraft` 只在明确章节改写语义下进入 `tryHandleChapterDraftUpdate`。
- DB 模式先由 Repository 读取当前章与必要的上一章正式版本；缺失阻断来源时在模型调用前停止。
- `rewriteChapterDraftWithAI` 把用户指令分类为 `continuity / development / scene_dialogue / prose`，当前草稿是保护基线。
- 模型输出通过 strict parser、P4 越层保护和可选 P5 不退化检查后，才交给受控写入创建待确认修订。

## 修复语义

- P4 失败：只重新执行当前层及必要下层，保护未授权字段和事实。
- P5 失败：保留用户有效修改，同时恢复当前草稿已承接的前章结尾事实。
- 格式失败：只修复六区块格式并保留已执行修改。
- 三者共用一次修复机会；第二次失败停止。

## 资产缺口

- Skill 已记录 P4/P5 边界，但主 Prompt 与修复正文仍硬编码在 `dialogue-prompt.util.ts` 和 `script-dialogue.service.ts`。
- 四层自然语言合同只为 Prompt 使用；固定分类与越层 Validator 仍应留在 TypeScript。

## 最终实现结论

- 主修订读取 `references/chapter-edit-prompt.md`，并按 Server 已确定的枚举读取四个层级合同之一。
- 有/无前章正式来源使用不同连续性 reference；当前草稿、用户要求和精确前章版本信息仍由运行层注入。
- P4、P5 和 strict format 分别读取三份修复模板，但仍共用原有一次修复总上限。
- `script-revision-quality.util.ts` 只保留分类、标签和固定 Validator，不再保存给模型看的自然语言层级合同。
- 来源卫生测试阻止主修订与三类修复正文回流 TypeScript，并验证真实 builder/service 接线。
