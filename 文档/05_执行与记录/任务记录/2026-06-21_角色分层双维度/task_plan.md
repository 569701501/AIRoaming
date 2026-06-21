# 角色分层双维度（level 5层 + entityType 4类）· task_plan

---
doc_id: AIR-TASK-2026-06-21-CHARACTER-DUAL-DIMENSION
status: active
created: 2026-06-21
updated: 2026-06-21
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-21 讨论（角色层级中文关键词判断不准 + 漫剧专业角色分类表）
---

## 1. 任务类型

数据模型扩展 + 判断方式改造。

## 2. 背景与目标

### 背景
角色层级(level)现由后端 `inferCharacterLevel` 用中文关键词正则推断（主角|女主|男主... → lead），不可靠且用户无法修改。用户遇到"最后一个角色没定稿按钮"的 bug，根因是角色被误判成 extra。同时用户提供了专业的漫剧角色分类表，要求支持更细致的角色分类（含怪物/群体/声音）。

### 目标
把角色分类从"单一 level（4层）"升级成"**level（5层）+ entityType（4类）双维度**"，第一批只搭骨架：
1. level 扩展到 5 层（加 minor），改为 AI 显式输出（关键词降级为兜底）
2. entityType 新增字段（human/creature/group/voice），只有 human 走通生图，其余占位
3. 解决"角色被关键词误判导致没定稿按钮"的 bug

## 3. 非目标（第一批不做）

- **creature 生图模板**：buildCharacterReferencePrompt 拆模板，留给第二批
- **group 构图模板**：群体生图要全新构图，留给第二批
- **voice 任务类型**：纯声音不出图，需新任务类型+新 asset 类型，架构级，留给第三批
- **不改枚举值**：recurring/chapter 保留（只改中文标签），不做 recurring→supporting 改名
- **前端不加改 level/entityType 的下拉 UI**：靠 AI 输出，用户暂不手动改
- **不升 schemaVersion**：靠 normalize 兜底兼容旧数据

## 4. 关键决策（已定）

| 决策点 | 结论 |
| --- | --- |
| level 枚举 | lead/recurring/chapter/**minor**/extra（加 minor，不改现有值） |
| minor 出图档位 | 归 chapter 档（要 preview_front，不强制 final_reference） |
| minor 重要性顺序 | 介于 chapter 和 extra 之间（lead:0 > recurring:1 > chapter:2 > minor:3 > extra:4） |
| level 判断方式 | AI 显式输出优先；AI 没给才 inferCharacterLevel 兜底；inferCharacterLevel 不删（剧本导入链路还要用） |
| 新角色 level 取值 | AI 优先（card.level ?? inferCharacterLevel） |
| 已存在角色 level | resolveMoreImportantCharacterLevel（只升不降） |
| entityType | 新增字段，4 枚举（human/creature/group/voice），默认 human |
| creature/group/voice 生图 | 第一批 fallback 到 human prompt（占位，不实现专属模板） |
| 枚举值改名 | 不改（recurring/chapter 保留） |
| 落地范围 | 分批：第一批搭骨架（level5层+entityType占位+human生图），后批做专属模板 |

## 5. 枚举定义

### 5.1 ProjectCharacterLevel（5 层）
lead（主角）/ recurring（重要配角）/ chapter（本章关键）/ minor（小角色）/ extra（背景路人）

### 5.2 ProjectCharacterEntityType（4 类，新增）
- human：人类角色（默认，现有生图正常走）
- creature：怪物/异常体/非人生物（第一批占位，生图 fallback 到 human）
- group：群体角色（第一批占位，生图 fallback 到 human）
- voice：纯声音角色（第一批占位，不出图）

### 5.3 level 出图档位映射
| level | 默认 referenceKind | 强制三视图(preflight) | status 初值 |
| --- | --- | --- | --- |
| lead | final_reference | 是 | needs_reference |
| recurring | final_reference | 是 | needs_reference |
| chapter | preview_front | 出场>1次时是 | draft |
| **minor（新）** | **preview_front** | **否** | **draft** |
| extra | preview_front | 否 | draft |

## 6. 阶段划分

| 阶段 | 内容 | 角色 |
| --- | --- | --- |
| P1 | dto.ts 枚举扩展（level加minor + 新增entityType + StoryStructureCharacterCard加 level/entityType） | Worker |
| P2 | projects.service.ts level 逻辑加 minor（~12处：枚举常量/normalize/defaultKind/status/preflight/sort×2/resolve/infer/defaultRole/3处status初值） | Worker |
| P3 | projects.service.ts entityType 字段（normalizeEntityType默认human + 4处新建角色字面量加字段） | Worker |
| P4 | syncStoryStructureCharacters：level 改 AI 优先 + entityType 透传 | Worker |
| P5 | dialogue.service.ts：prompt 加 level/entityType 枚举说明 + normalize 读字段 | Worker |
| P6 | 前端：getLevelLabel 加 minor + getEntityTypeLabel + workbench-store 镜像同步 | Worker |
| P7 | Scrutiny typecheck + build + 文档（核心数据模型 + AI上下文入口 + 完成记录） | Scrutiny/Worker |

## 7. 退出标准

1. typecheck + build 通过。
2. AI 生成剧情结构时输出 level + entityType（合法枚举值）。
3. 角色被误判 extra 的 bug 解决（AI 输出正确 level）。
4. minor 层级行为正确（归 chapter 出图档）。
5. entityType 字段持久化 + 旧数据默认 human 兼容。
6. creature/group/voice 生图 fallback 到 human（不崩）。
7. 文档同步。

## 8. 风险

| 风险 | 应对 |
| --- | --- |
| level order Record 两份不同步 | 抽成共享常量 CHARACTER_LEVEL_ORDER |
| 前端镜像逻辑（store）漏改 | P6 显式同步两处镜像 |
| creature 生图质量（fallback human prompt 画怪物不像） | 第一批接受，记为已知限制，第二批做专属模板 |
| AI 输出非法 level/entityType | normalize 兜底（非法 level→chapter，非法 entityType→human） |
