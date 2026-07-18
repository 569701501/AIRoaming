---
name: image-reference-generate
description: 在角色库或场景参考图阶段，根据正式项目画风、角色事实或场景卡生成角色正面预览、角色四视图定稿或无人场景参考图的生产 Prompt；只生成参考资产提示词，不生成剧情画格、整页漫画或新剧情事实。
---

# image-reference-generate

为后续漫画镜头提供稳定的角色身份和场景空间参考资产。

## 动作

- `character_preview`：一个角色的正面半身身份种子。
- `character_final`：基于已确认预览图的同角色四视图定稿。
- `scene_reference`：一个无人、无字、空间关系稳定的可复用场景背景。

## 输入边界

- 角色只读取正式项目角色事实和项目画风，不从剧情常识补身份。
- 四视图必须把已确认预览图作为严格身份来源。
- 场景只读取正式场景卡及项目画风，不加入故事动作和人物。
- 项目、角色、场景和参考图 ID 由后端管理，不写入 Prompt 模板。

## 生产模板

- 共用画风： [references/style-guide.md](references/style-guide.md)
- 项目画风、漫画格式和缺省事实词汇： [references/reference-defaults.json](references/reference-defaults.json)
- 角色预览 V2： [references/character-preview-v2.md](references/character-preview-v2.md)
- 角色定稿 V2： [references/character-final-v2.md](references/character-final-v2.md)
- 场景参考 V2： [references/scene-v2.md](references/scene-v2.md)
- 冻结 A/B 基线：`character-preview-v1.md`、`character-final-v1.md`、`scene-v1.md`

以上模板和词汇表是生产 Prompt 事实源。后端只填充 `{{PLACEHOLDER}}`、选择动作与版本、提交图片任务和保存结果。

## 输出与确认

- 输出一个完整图片 Prompt 字符串。
- 参考图生成结果仍须经过现有预览、确认和锁定流程。
- Skill 不直接调用图片服务；调用、费用控制和任务状态由后端负责。

## 禁止事项

- 不把角色参考图生成真人照片、演员定妆照、Cosplay 或 3D 渲染。
- 不在角色参考图中加入场景、剧情动作、额外角色或文字标签。
- 不在场景参考图中加入人物、人群、肖像、故事动作或可读文字。
- 不让四视图出现不同脸型、服装、年龄、比例或重复视角。
- 不为 OpenAI、豆包、Grok复制三套角色或场景创作规则。
