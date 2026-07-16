---
doc_id: AIR-TASK-20260717-DUAL-STORYBOARD-PROMPT-V23-HANDOFF
status: completed
created: 2026-07-17
updated: 2026-07-17
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: task_plan.md、实现差异与真实 A/B
---

# V2.3 Handoff

## 已交付

- 分镜生成和待确认调整均按“对白候选选择 → 对白分段 → 状态边界 → 共享 Shot → 漫画静态价值”执行。
- 从精确正式 `ChapterScriptVersion` 编译全章对白、旁白和有声音证据的引号候选。
- 固定 Markdown 可解析时，所有 `motion.voiceLines[].line` 必须逐字命中候选；历史纯文本保持兼容。
- 来源错误复用现有一次定向修复，第二次失败仍不创建 pending。
- 页面、Schema、DTO、数据库和用户确认流程未改变。

## 当前生产结论

V2.3 已通过定向、全量、类型、构建和两条真实项目浏览器验收，成为当前生产基线。

## 精确边界

- 用户仍需明确输入生成当前章节分镜。
- 生成结果仍只是 `pending_confirmation`。
- 用户点击确认后才形成正式 StoryboardVersion 并解锁出图准备。
- 本轮不调用图片、视频、TTS、字幕或排版服务。

## 已知残留

1. 全章候选会增大长对白章节的 Prompt；当前 AI 样本约 4.16 万字符，尚未触及运行阻断。
2. 精确台词门只能证明台词有来源，不能证明每句都必要。
3. Beat ID 全覆盖不能证明 `summary/outcome` 全部视觉化；AI 样本开场未明确表现旧机器刹车声。
4. M1 仍共享 comic/motion 的 Shot 数、景别和机位，独立序列继续后置。

## 回滚

若后续多样例出现明显退化，可回退本次对白候选编译、Prompt V2.3 文案、质量门参数和相关测试，即恢复 V2.1；无数据迁移和历史正式产物需要回滚。

## 后续优先级

非本次未完成项。若另行立项，优先做独立的 Beat `summary/outcome` 语义软评测与多题材回归，不继续向核心 Storyboard Schema 加字段。
