# ADR-0006 剧情结构卡角色 ID 回填方案

---
doc_id: AIR-ADR-0006
status: active
created: 2026-06-21
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer
source: 2026-06-21 剧情结构 StoryStructure 字段调整讨论(1.md)、grill-with-docs 拷问结论、代码事实核对
---

## 1. 状态

已采纳。

## 2. 背景

剧情结构阶段的 `StoryStructureCharacterCard`(本章结构角色卡)和项目级 `ProjectCharacter`(项目角色库)之间，原先**只靠角色名(name)做关联**：

- `syncStoryStructureCharacters`(`projects.service.ts`)在用户确认剧情结构时，用 `normalizeCharacterNameKey(name)`（实现是 `name.trim().toLowerCase()`）按名字去项目角色库里找。
- 找到就复用，找不到就自动新建一个 `ProjectCharacter(source=story_structure)`。

这套机制能避免"重复建角色"，但 name 匹配对中文很不稳：

| 场景 | 结构卡写的 | 角色库存的 | 结果 |
| --- | --- | --- | --- |
| 多/少空格 | "林 烬" | "林烬" | 断链、重复建 |
| 全角半角 | "Ａ酱" | "A酱" | 断链、重复建 |
| AI 带称呼 | "林烬（主角）" | "林烬" | 断链、重复建 |
| 别名/简称 | 第 2 章"小烬" / "白医生" | "林烬" / "白明远" | 断链、重复建 |
| 改名(`in_use` 前) | 结构卡还是旧名 | 角色库已改新名 | 断链 |

断链的后果是：同一个角色被建成两个 `ProjectCharacter`，破坏项目角色库的单一事实源。

## 3. 决策

### 3.1 结构卡增加 `projectCharacterId` 外键

给 `StoryStructureCharacterCard` 增加 `projectCharacterId: string | null` 字段，指向项目角色库正式实体 `Character.id`。`projectCharacterId` 是已落盘兼容字段名；当前 Shared 文件态 DTO 类型 `ProjectCharacter` 与 `Character` 表达同一角色记录，不另建第二个实体。

- 项目角色库 `Character` 是角色身份事实源：角色长什么样、角色图、`final_reference` 角色定稿组合图、服装、层级、状态，都以它为准；当前代码中的 `ProjectCharacter` 只是文件态 DTO 名称。
- 结构卡(`StoryStructureCharacterCard`)只描述"这个角色在本章中的作用、动机、关系、视觉提示"，身份锚点用 `projectCharacterId`。

### 3.2 id 的唯一填入时机 = 确认剧情结构

```text
AI 生成结构卡( pending 预览 )  →  projectCharacterId 为空
        ↓ 用户点确认
后端 syncStoryStructureCharacters 按 name 匹配/建角色，拿到 char_xxx
        ↓
回填 projectCharacterId 写进 structure.json
        ↓
之后读结构卡，id 即稳定外键
```

- pending 预览**不回填** id。
- 只有 `confirmChapterStoryStructure` 触发 `syncStoryStructureCharacters` 时才回填。

### 3.3 id 不做失效兜底

因为**当前项目角色不可删除**（`Character` 没有删除接口、也没有删除 UI，是产品既定设计），`projectCharacterId` 写入后在现行规则下始终指向有效角色，不需要"id 失效退回 name"的容灾逻辑，也不需要"删角色时联动清理结构卡"。

`merge_existing`(出图准备阶段)会把正式分镜里的文本 token 替换成已有 `character.id`，但**不删除被合并的源角色**，所以结构卡里的旧 id 不会悬空。

### 3.4 name 仍是跨章节关联的二级线索

`projectCharacterId` 不是从 AI 生成时就有——第 2 章第一次生成结构卡时，AI 只写 name，id 为空。后端靠 name 找到第 1 章已建的角色，回填同一个 id。

因此 **name 仍是跨章节建立"同一个角色"关联的唯一线索，id 是章节内确认后的缓存**。这要求 name 在实际使用中保持稳定：

- 角色名在普通图片生成弹窗里只读(`CharacterImageList.vue`)。
- 后端 `updateProjectCharacter` 虽支持改名(`draft/needs_reference/finalized` 阶段，`in_use` 锁定)，但前端无编辑档案的 UI，实际改不了。

### 3.5 回填接法：在现有 sync 函数内顺手回填

不新增独立函数、不重复算 name→id 映射。在 `syncStoryStructureCharacters` 已有的两个分支(已存在角色 / 新建角色)里，匹配出角色后顺手把 id 写回 `structureJson.characters[index].projectCharacterId`。

### 3.6 schemaVersion 保持 1

只加一个可选字段，不改结构形状。旧 `structure.json`(无 `projectCharacterId`)重读时由 normalize 补 `null`，不升版本、不写迁移脚本。

## 4. 被否决的备选

### 4.1 否决：场景卡也加 `projectSceneId`

1.md 原始讨论稿建议场景卡预留 `projectSceneId: null`。否决原因：

- 项目里**没有项目级场景库在跑**，`SceneLocation` 实体定义存在但没有像角色那样的 name 匹配/自动建库逻辑(`syncStoryStructureScenes` 不存在)。
- 预留一个永远没人读、没人写的字段，违反"中间产物必须可追溯"的建模原则。
- 等真有"跨章节复用场景"需求时，连同回写机制一起做，不先埋空字段。

### 4.2 否决：beat 增加 purpose / emotionalChange / mustInclude / mustAvoid / shotCountHint 等分镜前置字段

1.md 原始讨论稿建议 beat 加一堆字段。否决原因(代码事实)：

- 分镜生成(`buildStoryboardPrompt`)当前**根本不逐 beat 消费 beat 字段**，只读 `beats.length` 推算镜头数，beat 的 title/summary/characters 一个都没序列化进分镜 prompt。
- 在不改分镜 prompt 的前提下给 beat 加字段，是死字段，解决不了 1.md 说的"分镜不稳定"问题。
- 要真正打通"beat 驱动分镜"是架构级改动，应单独立项，不混在结构卡 id 回填里。

### 4.3 否决：读结构卡时 id 优先 + name 兜底(写法 B)

拷问阶段考虑过"id 失效就退回 name 匹配"的容灾逻辑。否决原因：角色不可删，id 不会失效，容灾逻辑是多余的复杂度。

### 4.4 否决：让 AI 自己填 projectCharacterId

把项目角色库列表塞进 prompt 让 AI 自己对 id。否决原因：AI 容易瞎编 id，不可靠。id 一律由后端回填，AI 只写 name。

## 5. 已知限制

- **角色档案编辑能力缺失**：后端 `PATCH /projects/:projectId/characters/:characterId` 已支持改 `name/role/level/appearance/personality/promptFragment`，但前端没有任何编辑档案的 UI(前端 `updateProjectCharacter` 事件链路是死代码，无人 emit)。本次不做编辑页，作为已知限制记录。后续如放开角色名编辑，需同步更新所有章节结构卡里的 name，否则跨章节 name 关联会断。

## 6. 影响范围

### 6.1 类型契约

- `packages/shared/src/dto.ts` `StoryStructureCharacterCard` 新增 `projectCharacterId: string | null`。

### 6.2 后端

- `apps/server/src/projects/projects.service.ts`：
  - `normalizeStoryStructureCharacters`：补 `projectCharacterId` 默认 null(兼容旧文件)。
  - `syncStoryStructureCharacters`：改返回结构，回填 id 到 `structureJson.characters`。
  - `confirmChapterStoryStructure`：把回填后的 structureJson 接进落盘。
- `apps/server/src/dialogue/dialogue.service.ts`：
  - `normalizeStoryStructureCharacters`(第二份)：同步补默认 null。
  - `buildStoryStructurePrompt`：约束 AI 不输出 `projectCharacterId`。

### 6.3 前端

- 零改动。加字段向后兼容：`StoryStructureWorkspace.vue` 只渲染 name/role/motivation/relationship/visualTraits，多出的字段被忽略；深拷贝编辑回写(`cloneStructure`)会原样保留该字段；无 zod/运行时 schema 校验。要让前端真正"用上"该字段(如点结构卡跳角色详情)，才需要改 `StoryStructureWorkspace.vue` 的匹配逻辑，本次不做。

### 6.4 关联文档

- `文档/02_架构与契约/核心数据模型.md` 第 6 节 StoryVersion：补充 `structureJson.characters[].projectCharacterId` 语义。
- `文档/00_索引/AI上下文入口.md`：补一条产品取舍。

## 7. 风险与回滚

| 风险 | 应对 |
| --- | --- |
| `syncStoryStructureCharacters` 改签名后调用点处理错误 | 仅 `confirmChapterStoryStructure` 一处调用，已确认接线 |
| 旧 structure.json 无新字段 | normalize 补 null，读取不报错 |
| 角色档案编辑缺失导致 name 长期不可改 | 记为已知限制；放开编辑时需联动更新结构卡 name |

回滚：删除 `StoryStructureCharacterCard.projectCharacterId` 字段，normalize 去掉默认值，`syncStoryStructureCharacters` 恢复原签名。已落盘的 `structure.json` 里多出的 `projectCharacterId` 键会被 normalize 忽略，不影响读取。

## 8. 验证标准

- 新建项目 → 写剧本 → 完成本章 → 生成剧情结构(pending 预览，projectCharacterId 为空)→ 确认结构 → 落盘的 `structure.json` 每个 character 带 `projectCharacterId: "char_xxx"`。
- 项目角色库自动建出角色，角色 id 与结构卡 projectCharacterId 一致。
- 第 2 章重复同一角色，确认后结构卡 projectCharacterId 与第 1 章相同(靠 name 匹配到同一角色)。
- 无 projectCharacterId 的旧 structure.json 能正常读取，重新确认后回填 id。
- 前端剧情结构页正常显示、字段级编辑保存后 projectCharacterId 不丢失。
