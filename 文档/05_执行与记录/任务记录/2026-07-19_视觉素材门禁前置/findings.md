# 发现与决策

---
doc_id: AIR-TASK-20260719-VISUAL-PREFLIGHT-FINDINGS
status: completed
created: 2026-07-19
updated: 2026-07-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 需求

- 出图准备只检查缺项，缺项不能通过；不在这里生成或修复素材。
- 素材要求必须在剧情结构阶段就确定，且不增加新的用户阶段和页面字段。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `ADR-0004_角色版本与定稿时机方案.md` | 角色生成与定稿操作发生在剧情结构页，出图准备做硬门槛 |
| `2026-06-02_角色库与出图准备流程调整方案.md` | 2026-06-21 已明确出图准备不再充当第二角色库 |
| `character-domain.util.ts` | 当前门禁只看 level 和下游出镜次数 |
| `CharacterImageList.vue` | 定稿按钮依赖正式 `snapshot.shots`，是按钮延迟根因 |
| `source-snapshot-builder.service.ts` | DB 预检重复实现同一出镜次数规则且忽略 entityType |
| `storyboard-reference.util.ts` | 当前允许引用结构外的其他项目角色，边界比正式文档更宽 |

## 研究发现

- StudioBinder、LTX、Boords、Katalist、StoryboardHero 的公开流程共同支持“先拆解/登记元素，再由分镜引用”的方向。
- 当前项目已有 `level + entityType`，足以在不扩页面字段的情况下先完成第一版要求矩阵。
- 当前 Asset 仅有 `preview_front/final_reference`，因此 creature/group 首版复用单张 preview 作为非人物/群体视觉参考；不强行走人类四视图。

## 缺口与风险

| 风险 | 影响 | 处理 |
| --- | --- | --- |
| 旧预检仍可能被视为 current | 绕过新规则 | 新写 v2，生产状态只接受 v2；v1 兼容读取 |
| group 文本别名产生多 Character | 重复素材与门禁 | 仅对 group 做保守后缀归一，并保留原显示名 |
| creature/group 使用人类单人 Prompt | 图片类型不匹配 | 在同一 `image-reference-generate` Skill 内增加类型化 V2 preview 模板 |
| 通用 prop/object 尚无模型 | 道具仍可能借用 creature | 本轮非目标，完成记录保留后续方向 |

## 技术决策

| 决策 | 依据 |
| --- | --- |
| 共享规则放在 `packages/shared` | 前端、file 兼容逻辑和 DB 版本链必须共用 |
| UI 不读取 shots 决定按钮 | 上游操作不能依赖下游正式产物 |
| 分镜引用只接受当前结构卡映射 | 防止分镜静默引入新视觉主体 |
| 出镜次数继续展示但不参与 required kind | 保留可解释性，不再制造晚到要求 |

## 复核发现

### Scrutiny Review

- 通过，无阻断问题。生产逻辑不再使用 `appearanceCount > 1` 判定素材类型；Shared、Server、Web、Prompt 和文档口径一致。兼容 file resolve API 保留但 DB-only 生产已退役，不影响纯门禁。

### Runtime/User Review

- 通过。真实项目中 human/chapter 显示定稿组合图，creature/group/minor 显示单张参考；“商队众人/商队多人”素材投影合并为一张卡。出图准备明确只做检查，没有生成按钮，页面重载后无新增错误，全程图片调用为 0。
