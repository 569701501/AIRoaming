# AI漫游 OpenCode AI 资产

该目录是 AI漫游自己的 OpenCode AI 资产源码层，参考 AuroraPlatformWeb 的 `apps/server/opencodeAI` 结构，但不复用 Aurora 的游戏、Phaser、沙盒闭环提示词。

当前状态：该目录是 AI 角色、Skill 与 Prompt 模板的源码事实源。P1 灵感、P2 项目大纲、A4 单章起草、A5.3 章节修订、已有剧本 B2/B4、剧情结构、分镜、角色/场景参考图和候选图生产链已通过后端只读资产加载器直接读取本目录；“复制完整目录到 OpenCode session home”的原生模板服务仍未接入。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `AGENTS.md.tpl` | OpenCode runtime 全局规则模板 |
| `opencode.json` | 后续 OpenCode session 配置模板入口 |
| `agents/*.md` | 阶段或模式级 agent，定义角色、权限、可用 skill 和行为边界 |
| `skills/**/SKILL.md` | 可复用阶段能力，定义触发时机、输入、输出、失败条件和验收口径 |
| `skills/**/references/*` | 对应 Skill 的生产 Prompt 模板、Provider 投递 Profile 和可读配置；后端只填动态变量 |
| `tools/` | 后续对 OpenCode 暴露的受控业务工具封装 |

## Skill 文件格式

每个 `skills/**/SKILL.md` 必须以 YAML frontmatter 开头，至少包含：

```yaml
---
name: script-example
description: 用一句话说明触发时机、核心职责和关键边界。
---
```

要求：

- `name` 必须和 skill 目录名一致。
- `description` 写给模型和运行时检索使用，应包含触发场景、输出目标和关键禁止事项。
- frontmatter 后再写正文标题和详细流程。

## 命名规则

- Agent：`airoaming__{workflow-or-step}-agent.md`
- 剧本阶段 skill：`script-*`
- 剧情结构 skill：`structure-*`
- 分镜 skill：`storyboard-*`
- 候选图 skill：`image-*`
- 排版导出 skill：`layout-*`
- 素材包 skill：`asset-*`

## 边界

- AI 可以读取后端注入的项目、章节、workflow 和附件上下文。
- AI 不直接读写本地物理路径，不直接编辑 `workspace/projects/*`。
- 任何写入项目事实源的动作都必须经过 AI漫游后端受控工具/API。
- Skill 负责降低上下文漂移，不替代 `文档/`、DTO、后端校验或用户确认。
- 稳定创作规则和 Prompt 正文不得在后端代码中再维护一份；后端只读取 Skill 资产、注入动态事实、执行固定校验和受控写入。
- 当前图片 Provider Profile 只处理语言和单字符串投递差异，不能形成 OpenAI、豆包、Grok 三套不同剧情语义。
