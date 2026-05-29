# AI漫游 OpenCode AI 资产

该目录是 AI漫游自己的 OpenCode AI 资产源码层，参考 AuroraPlatformWeb 的 `apps/server/opencodeAI` 结构，但不复用 Aurora 的游戏、Phaser、沙盒闭环提示词。

当前状态：目录先作为 agent / skill / tool 的事实源落地；运行时尚未接入“把本目录复制到 OpenCode session home”的完整模板服务。

## 目录职责

| 路径 | 职责 |
| --- | --- |
| `AGENTS.md.tpl` | OpenCode runtime 全局规则模板 |
| `opencode.json` | 后续 OpenCode session 配置模板入口 |
| `agents/*.md` | 阶段或模式级 agent，定义角色、权限、可用 skill 和行为边界 |
| `skills/**/SKILL.md` | 可复用阶段能力，定义触发时机、输入、输出、失败条件和验收口径 |
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
