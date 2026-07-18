---
doc_id: AIR-ADR-0017
status: active
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 用户明确纠偏、OpenCodeAI 目录契约、现有生产 Prompt 调用链
---

# ADR-0017 OpenCodeAI Skill 作为 Prompt 事实源

## 1. 决策状态

`已采纳`

## 2. 背景与问题

P1 灵感、P2 项目大纲、A4 章节起草、剧情结构、分镜、角色/场景参考图和候选图 Prompt 曾因 OpenCodeAI 目录尚未接生产运行时，被临时写入后端 TypeScript。结果是 Skill 目录不可见、后端承担创作正文、代码和文档存在漂移风险。用户明确要求 Prompt 应位于 `apps/server/opencodeAI/skills/`。

## 3. 决策

`apps/server/opencodeAI/skills/` 是稳定 Prompt 正文、方法与质量边界的唯一可编辑事实源；后端使用只读加载器填充动态事实，不再维护同义 Prompt 正文。

### 3.1 不变量

- Skill/`references/` 保存稳定角色、方法、输出要求、禁止事项和 provider 投递 Profile。
- 后端保存业务状态机、动态上下文装配、严格 Schema/引用/质量校验、版本写入和 provider HTTP 适配。
- Prompt 缺失、Skill 名称不符、reference 越界或模板变量缺失时 fail-closed，不回落代码内隐藏模板。
- OpenAI、豆包、Grok 共享同一创作语义；Profile 只处理语言和单 Prompt 投递格式差异。
- 页面字段、用户确认门、数据库 Schema 和付费调用触发规则不因本决策变化。

### 3.2 适用范围

- `script-inspiration-seeding`
- `script-outline-drafting`
- `script-chapter-drafting`
- `structure-story-parse`
- `storyboard-shot-generate`
- `image-reference-generate`
- `image-candidate-generate`

章节修订和已有剧本导入的历史 Prompt 后续按同一原则渐进迁移，本 ADR 不要求一次完成。

### 3.3 非目标

- 不开放 OpenCode 的 bash、edit 或本地文件写权限。
- 不让模型直接写项目事实源。
- 不把固定校验器改写成自然语言 Prompt。
- 不执行真实图片 A/B。

## 4. 被否决的备选

| 备选 | 优点 | 否决原因 |
| --- | --- | --- |
| Prompt 全部留在后端代码 | 运行直接 | 用户不可见，Skill 失去事实源意义，规则易漂移 |
| Skill 和代码各保留一份 | 迁移简单 | 两份可编辑真相，无法保证同步 |
| 只移动文件，不接生产加载 | 看起来符合目录约定 | 生产仍不使用 Skill，属于假接线 |
| 立即开放 OpenCode 全部原生工具 | 少写加载器 | 扩大权限面，与当前受控工具边界冲突 |

## 5. 影响与后果

### 正向后果

- 用户和开发者能直接查看实际生产提示词。
- Prompt 改动与 Skill 版本天然同目录，可独立评审和测试。
- 后端代码回归到业务装配和校验职责。

### 代价与限制

- 服务端发布物必须能读取 `opencodeAI/skills`。
- 模板变量和 JSON Profile 需要严格校验。
- 章节修订和已有剧本导入 Prompt 尚未迁移，短期仍是渐进状态。

| 影响面 | 变化 |
| --- | --- |
| 产品与用户流程 | 无变化 |
| 数据模型 | 无变化 |
| API / 任务协议 | 无变化；Prompt 来源改变 |
| 文件与 Asset | 本 ADR 当前覆盖七个生产 Skill 及 references |
| 前端 / 后端模块 | 后端新增只读 Skill 加载器，生成器改为动态填充 |
| 测试与验收 | 增加 Skill 校验、加载、模板变量、构建产物路径和原有 Prompt 回归 |

## 6. 兼容、迁移与切换

- 角色/场景与候选图 V1 保留为 Skill 内冻结 A/B 模板。
- 不允许 Skill/代码双写 Prompt 正文。
- 新代码部署后立即从 Skill 读取；已冻结任务继续使用数据库中的实际 Prompt 字符串。
- OpenCode 原生 session-home 模板复制未来接入时复用同一目录。

## 7. 风险与回滚

| 风险 | 影响 | 预防或检测 | 回滚方式 |
| --- | --- | --- | --- |
| 发布缺少 Skill 文件 | 生成失败 | 构建后加载测试、启动时 fail-closed | 恢复完整 Skill 资产发布，不恢复代码内第二份 Prompt |
| 模板变量遗漏 | Prompt 不完整 | 严格 renderer 和单元测试 | 修复 Skill 模板或装配变量 |
| Provider Profile 漂移 | 图片语义不一致 | 三家同语料离线合同测试 | 回退对应 Skill Profile 版本 |

## 8. 验证标准

- [x] 七个已接生产 Skill 的本轮新增或修改资产通过 `quick_validate.py`；既有 Skill 维持原校验结论。
- [x] 生产构造器真实读取 Skill reference。
- [x] 模板变量缺失和路径越界 fail-closed。
- [x] 分镜、参考图、候选图及 provider 离线回归通过。
- [x] 编译产物能够定位同一 Skill 目录。
- [x] 持久 `shot_generate` 复用完整分镜 Skill、对白来源、固定质量门和一次修复，不再维护第二套简化方法。
- [x] 对话剧情结构与持久 `story_parse` 共用 `structure-story-parse`，后台只补本地引用和数据库关联，并执行同一固定质量门与一次修复。
- [x] provider 参考图职责、分镜 JSON 示例、参考图画风与漫画格式词汇已归入对应 Skill references。
- [x] A2 P1 灵感生产与一次修复读取 `script-inspiration-seeding`，仍只交付恰好 3 个六字段候选。
- [x] A3 直接题材、选中灵感与待确认大纲重新生成读取 `script-outline-drafting`，Shared 仍负责固定 Markdown 格式和章节卡完整性。
- [x] A4 主生成、P3/P5 质量重写和 strict format 修复读取 `script-chapter-drafting`；Shared strict parser、Server Validator、一次修复上限、显式单章触发和 A5 pending 流程不变。
- [x] 源码防回流测试覆盖本次已迁移的稳定创作词句和相关生产接线。
- [x] Runtime/User Review 不涉及页面变化；真实付费图片调用明确不执行。

## 9. 关联资料

- 方案：`文档/04_方案与决策/2026-07-16_分镜及后续提示词改造顺序.md`
- 实施任务：`文档/05_执行与记录/任务记录/2026-07-18_Prompt技能归位/`
- 残留复核：`文档/05_执行与记录/任务记录/2026-07-18_后端Prompt残留复核/`
- 残留修复：`文档/05_执行与记录/任务记录/2026-07-18_Prompt残留修复/`
- 剧情结构 Prompt 归位：`文档/05_执行与记录/任务记录/2026-07-18_剧情结构Prompt归位/`
- P1/P2 Prompt 归位：`文档/05_执行与记录/任务记录/2026-07-18_P1P2提示词归位/`
- A4 Prompt 归位：`文档/05_执行与记录/任务记录/2026-07-18_A4提示词归位/`
- 代码：`apps/server/src/ai-runtime/opencode-skill-asset.util.ts`
