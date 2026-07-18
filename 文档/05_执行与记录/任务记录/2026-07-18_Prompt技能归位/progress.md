---
doc_id: AIR-TASK-20260718-PROMPT-SKILL-PROGRESS
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: Prompt 技能归位任务执行记录
---

# Prompt 技能归位进度

## 2026-07-18

- Orchestrator：已读取项目事实源、`deep-think`、`skill-creator`、OpenCodeAI 目录与生产 Prompt 调用链。
- 发现：现有 `opencodeAI/skills/` 只有剧本 Skill；OpenCodeRuntime 启动时未加载该目录；分镜和图片稳定提示词散落在后端代码。
- 当前阶段：冻结事实源边界，准备建立三个生产 Skill。

### Worker

- 新建 `storyboard-shot-generate`、`image-reference-generate`、`image-candidate-generate` 三个生产 Skill，并将详细模板、模式片段、固定配置和 provider 编译配置放入各自 `references/`。
- 新增统一只读 Skill 资产加载器，限制 Skill 名称和引用路径，禁止目录穿越；模板变量缺失或残留时直接失败。
- 分镜生成与修复、角色/场景参考图、候选图领域合同及 provider profile 已改为读取 Skill 资产；服务端代码只保留动态事实组装、固定校验、版本和传输逻辑。
- 同步 OpenCodeAI 说明、系统架构、生成任务协议、核心数据模型、模块依赖和 ADR。

### 验证

- 三个 Skill 运行 `quick_validate.py`：全部通过。
- 服务端定向回归：分镜对话、创作 Prompt、Skill 加载器共 28/28 通过。
- 先前并发运行发生超时的迁移与备份用例已串行复跑：12/12、40/40 通过。
- 服务端完整回归：121 个测试文件、726/726 通过。
- 服务端和根目录类型检查、构建均通过；编译后 Skill 加载器可从 `dist` 正确读取资产。
- 全程未调用 OpenAI、豆包、Grok 或其他付费图片生成服务。

### Scrutiny Review

- 结论：`passed`。
- Skill 是稳定创作提示词的唯一可编辑事实源；生产调用真实读取 Skill 资产，不存在“只放文档、不接运行时”的空壳。
- provider 差异保留为交付 profile，不拆成三套创作方法；动态项目事实、数据库 ID、版本状态和固定校验仍由代码负责。
- 路径穿越、模板变量缺失、JSON 配置错误均为 fail-closed。

### Runtime/User Review

- 本次不改变页面、字段、用户确认点或七阶段流程，因此无需新增浏览器交互验收。
- 已用生产构造器测试、完整服务端回归和编译后加载检查验证运行边界。
- 真实视觉质量复测因用户明确禁止继续付费生图而不适用；不得据此宣称图片视觉质量已重新验收。

## 2026-07-18 后续复核纠偏

- 更深一轮源码与可达性审计推翻了本文件上方“Scrutiny Review passed”的完整性结论。
- 主模板和加载器确已接入，但仍有 `shot_generate` 旁路、provider 参考图职责、分镜示例语义、画风/版式 Prompt 词汇四类生产残留。
- 当前准确结论见 `文档/05_执行与记录/任务记录/2026-07-18_后端Prompt残留复核/`：`not_passed，需要修复`。

## Handoff

- 状态：完成，可交付用户检查。
- 后续编辑稳定提示词时，只修改对应 Skill 的 `SKILL.md` 或 `references/`；不要在服务端重新建立同义 Prompt 正文。
- 保留边界：视觉质量真实 A/B 仍须用户未来重新授权预算后才能执行。
