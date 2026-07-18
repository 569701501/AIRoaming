---
doc_id: AIR-TASK-20260718-PROMPT-SKILL-PLAN
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户关于分镜与图片 Prompt 应归属 OpenCodeAI Skill 的纠偏
---

# Prompt 技能归位任务计划

## 目标

把分镜、角色/场景参考图和候选图的稳定提示词从后端代码迁移到 `apps/server/opencodeAI/skills/`，让 Skill 成为唯一可编辑事实源；生产运行时真实加载这些资产，后端只负责动态上下文、校验、版本写入和 provider 传输适配。

## 非目标

- 不改变现有页面字段、用户确认节点和七阶段流程。
- 不改数据库 Schema。
- 不调用真实图片服务或产生图片费用。
- 不为 OpenAI、豆包、Grok 建立三套创作 Skill。
- 不迁移本轮无关的剧本和剧情结构 Skill。

## 验收标准

1. 存在可被发现和校验的 `storyboard-shot-generate`、`image-reference-generate`、`image-candidate-generate` Skill。
2. 分镜漫画/漫剧规则、角色/场景参考规则、候选图语义规则可在 Skill 目录直接阅读。
3. 生产构造器真实读取 Skill 资产；Skill 缺失或模板变量错误时明确失败，不静默回退到代码内第二份 Prompt。
4. 后端只保留动态数据装配、固定校验和 provider 接口差异。
5. 现有相关离线测试、类型检查和构建通过；不发起真实生图。

## 阶段

1. [x] 冻结事实源边界和现状证据。
2. [x] 创建并校验三个 Skill 及其 references。
3. [x] 实现统一 Skill 资产加载与模板渲染。
4. [x] 迁移生产调用并删除重复稳定提示词。
5. [x] 执行离线回归、Scrutiny Review 和文档收口。

## 关键决策

- Skill 目录是稳定提示词事实源；代码不得维护可独立修改的同义正文。
- 运行时采用项目自有只读加载器读取 Skill 资产并组装生产请求，避免依赖尚未开放的 OpenCode 本地文件/命令权限。
- provider 适配只处理单 Prompt/参数/能力差异，不改变创作语义。
- 详细模板放 `references/`，`SKILL.md` 保持流程、边界和资源路由清晰。

## 退出标准

- [x] 所有阶段完成且有验证证据。
- [x] Scrutiny Review 通过，无阻断项。
- [x] 未发起真实图片请求。
- [x] 正式架构/模块文档、完成记录、会话记忆和长期记忆完成同步。
