# 分镜字段拆分与枚举升级 · task_plan

---
doc_id: AIR-TASK-2026-06-21-STORYBOARD-FIELDS-SPLIT
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-21 分镜字段完整性调研(findings.md) + GPT 字段清单拷问 + grill-with-docs 结论
---

## 1. 任务类型

结构改造类（写代码）。把分镜 Shot 的字段做三件事：拆分（景别/机位/构图三合一 → 各自独立）、枚举升级（3 个文本字段 → 枚举）、补字段（durationMs 拆出、voiceLines 替换 voiceRole+line）。

## 2. 目标

把 `StoryboardShot` 字段从"混合自由文本"改造成"分层 + 枚举化"的结构，为后续出图提示词、排版、漫剧 TTS/视频等下游消费打基础。具体：

1. 把景别 `shotType`、机位 `cameraAngle` 从 `composition`/`compositionDesign` 里拆出来，提到**共同核心层**（comic 和 motion 共用一份）。
2. 把 `comic.panelRhythm`、`motion.cameraMovement`、`motion.frameType` 三个自由文本字段升级为**受控枚举**。
3. 把 `motion.voiceRole` + `motion.line` 替换为 `motion.voiceLines[]` 数组（支持多人对话、用 characterId）。
4. 把 `motion.durationHint` 拆成 `durationMs`(数字) + `durationHint`(展示文本)。

## 3. 非目标

- **不动前端**：前端 UI 本次不改（用户已定"理解 C"）。前端 voiceRole/line 会读不到（显示空），新增字段不展示，但数据正确，不报错。前端 UI 后续单独处理。
- **不写迁移脚本**：当前 workspace 只有 pending 数据，无正式 storyboard.json。pending 重生成即新格式。normalize 仍做兜底以兼容未来未知旧数据。
- **不实现下游消费**：出图提示词真正读字段、TTS、video 等下游不在本次范围。本次只改字段结构 + normalize + AI prompt。
- **不新增 GPT 清单里的过度设计字段**：砍掉 panelShape/characterPlacement/backgroundRole/textPlacement/emptySpaceHint/sfx/continuityHint/forbid/motion 的 8 个特效字段。
- **不动 StoryboardShot 顶层其他字段**：id/order/beatId/sceneId/characterIds/coreAction/emotion/promptDraft/lockedCandidateId/status 不动。
- **不升 schemaVersion**：保持 1（只加字段不改结构形状，靠 normalize 兜底）。

## 4. 关键决策（已定）

| 决策点 | 结论 | 来源 |
| --- | --- | --- |
| shotType/cameraAngle 放哪 | 共同核心层（comic/motion 共用一份） | grill 结论 + 用户拍板 |
| voiceLines 放哪 | 留在 motion 里 | 用户拍板 |
| UI 范围 | 前端不动 | 用户拍板（理解 C） |
| 老数据 | normalize 兜底，不写迁移 | 用户拍板（当前只有 pending，无正式数据） |
| schemaVersion | 保持 1 | 沿用 ADR-0006 思路 |

## 5. 枚举定义

### 5.1 ShotType（景别，共同核心）
establishing / wide / full / medium / close_up / extreme_close_up

### 5.2 CameraAngle（机位，共同核心）
eye_level / high_angle / low_angle / over_shoulder / top_down / dutch_angle

### 5.3 PanelRhythm（画格节奏，comic）
slow / normal / fast / impact / transition

### 5.4 CameraMovement（运镜，motion）
static / push_in / pull_out / pan_left / pan_right / tilt_up / tilt_down / track_left / track_right / slow_zoom / handheld / none

### 5.5 FrameType（镜头类型，motion）
atmosphere / dialogue / action / reaction / detail / transition

## 6. 字段结构（定稿）

### 共同核心层（StoryboardShot 顶层）
- 原有：id, order, beatId, sceneId, characterIds, coreAction, emotion
- **新增**：shotType(ShotType), cameraAngle(CameraAngle)
- 原有：comic, motion, promptDraft, lockedCandidateId, status

### comic（StoryboardShotComic）
- panelDescription(string) 原有
- composition(string) **语义收窄**：只留构图，景别/机位移到顶层
- dialogue(string) 原有
- caption(string) 原有
- panelRhythm(PanelRhythm) **升枚举**

### motion（StoryboardShotMotion）
- visualDescription(string) 原有
- compositionDesign(string) **语义收窄**：只留构图设计
- cameraMovement(CameraMovement) **升枚举**
- frameType(FrameType) **升枚举**
- **新增** durationMs(number) 时长毫秒
- durationHint(string) **语义收窄**：展示文本
- **删除** voiceRole, line
- **新增** voiceLines(StoryboardShotVoiceLine[]) 配音台词数组

### StoryboardShotVoiceLine（motion 内子结构）
- characterId(string | null) 和 projectCharacterId 思路对齐
- name(string)
- line(string)
- voiceStyle(string)

## 7. 阶段划分

| 阶段 | 内容 | 角色 |
| --- | --- | --- |
| P1 | dto.ts 类型契约（枚举类型 + voiceLine 接口 + 改 3 个接口） | Worker |
| P2 | 两份 normalize 兜底（projects + dialogue）+ 抽共享枚举工具 | Worker |
| P3 | buildStoryboardPrompt 改造（新结构 + 枚举约束） | Worker |
| P4 | Scrutiny 静态复核 + 构建检查 | Scrutiny |
| P5 | 文档同步（核心数据模型 + ADR-0007 + 入口） | Worker |
| P6 | 功能完成记录 | Worker |

## 8. 退出标准

1. typecheck + build 通过（shared/server/web 三包）。
2. 两份 normalize 对同一旧数据兜底结果一致（不漂移）。
3. AI prompt 输出符合新结构 + 枚举值。
4. 文档同步：核心数据模型.md Shot 节示例改新结构、ADR-0007 记录决策、AI上下文入口补一条。
5. 完成记录写入。
6. Runtime/User Review：用户重新生成分镜后，pending 文件是新结构（用户手动验证）。

## 9. 兜底默认值（normalize 用）

| 字段 | 旧数据兜底默认 | 兜底规则 |
| --- | --- | --- |
| shotType | `medium` | 不在枚举内或缺失 → medium |
| cameraAngle | `eye_level` | 不在枚举内或缺失 → eye_level |
| comic.panelRhythm | `normal` | 不在枚举内 → normal（旧自由文本"慢节奏留白"会丢语义，接受） |
| motion.cameraMovement | `static` | 不在枚举内 → static |
| motion.frameType | `atmosphere` | 不在枚举内 → atmosphere |
| motion.durationMs | `2500` | 缺失或从 durationHint 解析失败 → 2500 |
| motion.voiceLines | `[]` 或从旧 voiceRole+line 转换 | 旧有 voiceRole/line → 转成 [{characterId:null, name:voiceRole, line, voiceStyle:""}] |

## 10. 风险

| 风险 | 应对 |
| --- | --- |
| 两份 normalize 漂移 | 抽共享枚举兜底工具到 shared 包 |
| 旧自由文本丢失语义 | 已确认接受（测试数据） |
| 前端 voiceRole/line 读不到 | 已确认前端不动，用户知晓 |
| AI prompt 改造后生成质量 | 用完整枚举清单约束，示例 JSON 用新结构 |
