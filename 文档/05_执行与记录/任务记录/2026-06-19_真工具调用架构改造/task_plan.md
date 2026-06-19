# 任务计划:真工具调用架构改造(伪工具调用 → OpenCode 插件真工具调用)

---
doc_id: AIR-TASK-REAL-TOOL-CALL-001
status: active
created: 2026-06-19
updated: 2026-06-19
owner: AI漫游项目
audience: human, ai-agent, developer
source: 深思熟虑复核、AuroraPlatformWeb 架构参考、AIRoaming 现状探索
---

## 0. 文档说明

本计划是把 AI漫游从「伪工具调用(后端识别意图)」改造为「真工具调用(AI 通过 OpenCode 插件自主调用工具)」的总纲。

- 参考实现:AuroraPlatformWeb(`apps/server/opencodeAI/` + `apps/server/src/tool-callback/`)
- 现状基线:AIRoaming `apps/server/src/ai-runtime/opencode-runtime.service.ts`(只发消息,无工具) + `apps/server/src/dialogue/dialogue.service.ts`(伪工具调用)
- 关联文档:`文档/00_索引/全流程与字段清单.md`、`ADR-0004`

---

## 1. 愿景(终态)

### 1.1 一句话愿景

> AI漫游的 AI 是一个**能自主调用工具的 Agent**:它通过 OpenCode 的 function calling 机制,自己决定调用哪个工具(生成剧情结构、生成分镜、生成角色图、生成场景图……),传什么参数,做完一步看结果决定下一步。用户只需要给目标,不用逐步点按钮。

### 1.2 终态架构(三层)

```text
┌─────────────────────────────────────────────────┐
│ agent 层(Markdown 资产,人格/路由/编排)          │
│   opencodeAI/agents/*.md                        │
│   决定:当前阶段该用哪条链路、该调哪些工具         │
└───────────────────────┬─────────────────────────┘
                        ↓ 约束工具使用边界
┌─────────────────────────────────────────────────┐
│ skill 层(Markdown 资产,某阶段标准操作手册)      │
│   opencodeAI/skills/*/SKILL.md                  │
│   约束:这个阶段该读什么、能调哪些工具、产出什么    │
└───────────────────────┬─────────────────────────┘
                        ↓ 声明可用工具
┌─────────────────────────────────────────────────┐
│ tool 层(代码,原子能力,真 function calling)     │
│   opencodeAI/tools/*.js(tool() 定义)            │
│   每个 execute:参数校验 + HTTP 回调后端 + 格式化   │
└───────────────────────┬─────────────────────────┘
                        ↓ fetch POST /tool-callback/<name>
┌─────────────────────────────────────────────────┐
│ 后端工具网关(统一入口,鉴权 + 路由 + 业务编排)    │
│   src/tool-callback/tool-callback.controller.ts │
│   src/tool-callback/tool-callback.service.ts    │
└───────────────────────┬─────────────────────────┘
                        ↓ 委托
┌─────────────────────────────────────────────────┐
│ 业务 Service 层(真正干活)                       │
│   queueCharacterReference / generateScene...    │
│   requestDoubaoImage / 写文件 / 存 asset         │
└─────────────────────────────────────────────────┘
```

### 1.3 终态的能力清单(工具 = 真工具,AI 可自主调)

| 工具名 | 作用 | 对应业务 |
| --- | --- | --- |
| `generate_inspiration` | 找灵感种子 | 现有 tryHandleScriptInspiration |
| `generate_outline` | 生成剧本大纲 | 现有 tryHandlePendingScriptOutline |
| `generate_chapter_script` | 生成章节剧本 | 现有 tryHandleChapterDraftUpdate |
| `generate_story_structure` | 生成剧情结构 | 现有 tryHandleStoryStructureTools |
| `confirm_story_structure` | 确认剧情结构 | 现有 confirmStoryStructure |
| `extract_characters` | 提取项目角色 | 现有 extractProjectCharacters |
| `generate_storyboard` | 生成分镜 | 现有 tryHandleStoryboardTools |
| `confirm_storyboard` | 确认分镜 | 现有 confirmChapterStoryboard |
| `generate_character_image` | 生成角色图(预览/定稿) | 现有 queueCharacterReference |
| `generate_scene_image` | 生成场景背景图 | 现有 queueSceneReference |

### 1.4 终态的调用方式(三种并存)

```text
1. 用户对话自然语言 → AI 自主决定调哪个工具(真 function calling)
2. 用户点 UI 按钮   → 直接调后端业务 service(保留,快速路径)
3. [未来] Agent 自主跑流水线 → AI 看状态自己连续调工具
```

三种方式最终都走到业务 Service,工具只是 AI 的调用通道。

---

## 2. 目标 / 非目标

### 2.1 目标

1. 接通 OpenCode 的工具插件机制(`@opencode-ai/plugin`),让 AI 能真 function calling。
2. 建立工具定义目录(`opencodeAI/tools/`)+ 后端工具网关(`src/tool-callback/`)。
3. 把现有的 10 个能力从「伪工具调用」迁移为「真工具」,AI 能自主调。
4. 保留 UI 按钮直调(不破坏现有交互)。
5. 为将来 Agent 自主跑流水线留好口子(技能/agent 用 Markdown 注入)。

### 2.2 非目标(本轮不做)

- 不做 Agent 自主循环执行器(连续决策下一步)——这是下一轮,本轮只把工具地基打通。
- 不迁移 agent/skill 的 Markdown 资产(本轮先打通 tool 层,agent/skill 下一轮)。
- 不删 dialogue.service.ts 的伪工具调用(本轮并存,验证真工具稳定后再清理)。
- 不改前端候选图/排版/素材包(那些是 M2-M3 的事)。

---

## 3. 现状 vs 终态的差距(改造点)

| 维度 | 现状(AIRoaming) | 终态(已验证) | 改造 |
| --- | --- | --- | --- |
| OpenCode 版本 | 1.4.0(无插件发现) | **1.17.8**(已升级,支持插件自动发现) | ✅ 已升级 |
| 工具定义 | 无(散在 dialogue.service.ts) | `opencodeAI/plugin/*.js`(plugin 函数 + tool()) | 新建工具目录 |
| 工具发现 | 无 | **插件自动发现**:放 `~/.config/opencode/plugin/` 或项目 `.opencode/plugins/`,无需 config 注册 | 已验证 echo 可发现 |
| AI 调用方式 | 伪(意图识别) | 真(function calling,AI 输出 tool_call) | 接 SDK(1.17.8 原生支持) |
| 后端执行 | service 直调 | 统一 tool-callback 网关 | 新建网关 |
| 工具回调 | 无 | HTTP POST /tool-callback/<name> | 新建 controller |

### 阶段 A 验证结论(2026-06-19)

- OpenCode 已升级 1.4.0 → 1.17.8。
- 插件机制已验证:在 `~/.config/opencode/plugin/echo.js` 放插件文件,`opencode debug config` 显示 `plugin: ["file://.../echo.js"]`,**自动发现成功**。
- 1.17.8 的工具注册方式:每个插件文件 `export default async () => ({ tool: { 工具名: tool({description, args, execute}) } })`,放 `plugin/` 或 `plugins/` 目录,OpenCode 自动加载。
- **已解除的风险**:原担心"本地非沙盒注入方式与 Aurora 沙盒不同"——1.17.8 插件自动发现机制与沙盒无关,本地直接可用。

---

## 4. 实施阶段(分 5 阶段,每阶段可独立验证)

### 阶段 A:工具基础设施(地基)

**目标**:把 OpenCode 的工具插件机制接通,跑通一个最简单的工具(AI 能调用,后端能执行)。

**进度**:工具发现机制已验证通过(echo 插件被自动发现)。剩余:验证 AI 真能调用 + 回归升级后对话正常。

**任务**:
- A1. ✅ 升级 OpenCode 1.4.0 → 1.17.8
- A2. ✅ 写 echo 插件(plugin 函数格式),放 `~/.config/opencode/plugin/echo.js`
- A3. ✅ 验证插件自动发现:`opencode debug config` 显示 `plugin: ["file://.../echo.js"]`
- A4. ✅ 回归验证:升级 1.17.8 后,对话流式输出正常(SSE 协议 `dialogue.message.delta` 格式不变)
- A5. ✅ **验证 AI 真调用**:对话让 AI 调 echo,AI 成功通过真 function calling 调用,返回"已调用 echo 工具,返回结果:链路测试成功"
- A6. ⬜ (后续阶段做)新建后端 tool-callback 网关,echo 不需要回调,业务工具需要

**退出标准**:
- ✅ 插件被 OpenCode 自动发现
- ✅ 升级后现有对话功能正常(不回归)
- ✅ AI 在对话中能成功调用 echo 工具(真 function calling,非意图识别)
- ✅ AI 拿到工具结果继续对话

**阶段 A 结论(2026-06-19):真工具调用链路完全打通。** 从"用户对话"→"AI 决定调 echo"→"echo execute 执行"→"结果返回 AI"→"AI 组织语言回复",全链路验证通过。这是整个改造的地基,意味着后续所有业务工具(生成角色图/场景图/分镜等)都能用这个模式让 AI 自主调用。

### 阶段 B:迁移第一个真业务工具(生成角色图)

**目标**:用真工具调用实现"生成角色图",验证业务工具能跑通。

**任务**:
- B1. 写 `opencodeAI/tools/generate_character_image.js`(参考 Aurora `general_image_generation.js`):
  - args:characterId / referenceKind(preview_front / final_reference)/ prompt
  - execute:校验 + fetch POST 后端 /tool-callback/generate_character_image
- B2. 后端 tool-callback 加 `generate_character_image` 端点,委托现有 `queueCharacterReference`
- B3. 验证:对话里说"给林烬生成角色图",AI 调工具,后端生成,结果返回

**退出标准**:
- AI 能通过工具生成角色图(和现有按钮调用走同一个 queueCharacterReference)
- 角色图真实生成、落盘、进 asset

### 阶段 C:迁移其余生成类工具

**目标**:把生成场景图、生成剧情结构、生成分镜等迁移为真工具。

**任务**:
- C1. `generate_scene_image.js` + 后端端点(委托 queueSceneReference)
- C2. `generate_story_structure.js` + 后端端点(委托现有 story_structure 逻辑)
- C3. `generate_storyboard.js` + 后端端点(委托现有 storyboard 逻辑)
- C4. `extract_characters.js` + 后端端点(委托 extractProjectCharacters)
- C5. `generate_inspiration.js` / `generate_outline.js` / `generate_chapter_script.js`(剧本阶段工具)

**退出标准**:
- 每个工具 AI 都能自主调用并成功执行
- 业务产物(结构/分镜/图)正常落盘

### 阶段 D:确认类工具 + 状态查询工具

**目标**:补上"确认"类动作和"查状态"类工具,让 AI 能完成完整闭环。

**任务**:
- D1. `confirm_story_structure.js` / `confirm_storyboard.js`(确认动作)
- D2. `get_project_status.js`(AI 查当前项目/章节状态,决定下一步)—— 这是将来自主跑的关键
- D3. `get_chapter_detail.js`(AI 查章节内容)

**退出标准**:
- AI 能查状态、能确认产物,具备闭环能力的基础

### 阶段 E:并存验证 + 文档留痕

**目标**:确认真工具调用稳定,UI 按钮路径不受影响,留痕。

**任务**:
- E1. 全流程验证:对话驱动从灵感→大纲→剧本→结构→分镜→角色图→场景图,AI 自主调工具
- E2. UI 按钮路径回归:点按钮生成角色图/场景图仍然正常(并存)
- E3. 写功能完成记录 + ADR(架构决策留痕)
- E4. 更新 `文档/00_索引/AI上下文入口.md` 和模块文档

**退出标准**:
- 对话驱动和按钮驱动两条路都正常
- 完成记录 + ADR 已写
- 文档已同步

---

## 5. 关键设计决策(参考 Aurora,适配 1.17.8)

### 5.1 工具定义位置与发现

工具放 `apps/server/opencodeAI/plugin/*.js`(项目源码资产目录,不进 Nest 编译)。每个插件文件 `export default async () => ({ tool: { ... } })`。

**发现方式(1.17.8 已验证)**:OpenCode 自动发现 `~/.config/opencode/plugin/` 或项目 `.opencode/plugins/` 下的 `.js/.ts` 文件。AIRoaming 采用**项目级 `.opencode/plugins/`**——工具跟着项目走,不污染全局;运行时通过软链或复制让 OpenCode 发现。

开发期简化:直接放 `~/.config/opencode/plugin/`(全局自动发现),验证完再迁项目级。

### 5.2 工具 execute 保持瘦

execute 只做:① 参数校验;② HTTP 回调后端;③ 结果格式化。**业务逻辑全在后端 service**。参考 Aurora `general_image_generation.js`。

### 5.3 统一 tool-callback 网关

一个 Controller(`tool-callback.controller.ts`)+ 一个 Service。按工具名路由,委托业务 service。Token 鉴权(防外部调用)。

### 5.4 同步/后台双通道

长任务(生图)支持 `backgroundTask: true`,返回 taskId + 状态查询工具(参考 Aurora)。短任务(生成结构)同步返回。

### 5.5 OpenCode 启动

1.17.8 的插件自动发现**不需要改 spawn 命令**(不用复制目录、不用传配置参数)。只要插件文件在发现路径下,`opencode serve` 启动时自动加载。AIRoaming 的 `spawn("opencode", ["serve", ...])` 基本不用改,只需确保插件文件在发现路径。

**待定细节**:项目级 `.opencode/plugins/` 是否需要 OpenCode 从项目根目录启动才被发现(cwd 相关)。阶段 A 后续验证。

---

## 6. 风险

| 风险 | 应对 |
| --- | --- |
| ~~OpenCode 版本不支持插件~~ | ✅ 已解除:升级到 1.17.8,插件自动发现已验证 |
| ~~本地非沙盒注入方式与 Aurora 沙盒不同~~ | ✅ 已解除:1.17.8 插件自动发现与沙盒无关,本地 `~/.config/opencode/plugin/` 直接可用 |
| 项目级 `.opencode/plugins/` 发现依赖 cwd | 阶段 A 后续验证:OpenCode 从哪个目录启动决定项目级插件能否被发现;若不行用全局 `~/.config/opencode/plugin/` 或软链 |
| 真工具调用 AI 输出不稳定(乱调工具) | 工具 description 写清楚边界;加 opencode.json permission 控制 |
| dialogue.service.ts 伪工具调用和真工具并存期间混乱 | 阶段 E 之前不删伪工具,先验证真工具稳定 |
| 前端对流式输出的处理变化 | 真工具调用的 SSE 事件可能和现在不同,阶段 A 验证前端能不能正常显示 |
| 1.17.8 与现有 dialogue 流式协议(SSE message.part.delta)不兼容 | 升级后需回归剧本/分镜对话是否正常;阶段 A 验证 echo 前先确认基础对话没坏 |

---

## 7. 退出标准(整体)

1. AI 能通过真 function calling 调用全部 10 个工具。
2. 用户对话能驱动完整流程(灵感→…→场景图),AI 自主调工具。
3. UI 按钮路径不受影响(并存)。
4. 为 Agent 自主跑流水线留好口子(工具接口统一,agent/skill 待下一轮)。
5. typecheck/build 通过,全流程人工验收通过。
6. 完成记录 + ADR 已写,文档已同步。

---

## 8. 后续(下一轮,不在本轮)

- agent/skill 的 Markdown 资产建设(opencodeAI/agents/、opencodeAI/skills/)
- Agent 自主循环执行器(连续决策下一步)
- 清理 dialogue.service.ts 的伪工具调用
