# 任务计划:角色版本模型与出场关系

---
doc_id: AIR-TASK-ROLE-VERSION-001
status: pending
created: 2026-06-18
updated: 2026-06-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: ADR-0004、2026-06-18 角色库交互规则对齐实施
---

## 1. 任务背景

2026-06-18 完成了「角色库交互规则对齐」第一轮(剧情结构页角色区域分组、定稿状态机、老角色锁死等),对应 ADR-0004 规则 4-16。

**本任务记录第一轮主动推迟的两项**,作为下一轮的事实源:

1. 角色版本模型(versions 数组 + 区间生效)
2. 章节级出场关系(CharacterAppearance)

推迟原因:版本模型涉及后端约 95 处字段引用改造和老数据迁移,单值结构下的交互规则先对齐可独立交付;出场关系是增量能力,出图准备当前直接读角色列表也能跑。

## 2. 目标

在单值覆盖模型基础上,引入多版本区间模型与章节出场关系,完整实现 ADR-0004 规则 17-27。

## 3. 非目标

- 不改本轮已交付的交互规则(分组、定稿一步化、老角色锁死)。
- 不动主流程结构。
- 不动图片生成 provider 链路。

## 4. 范围与任务拆解

### 4.1 版本模型

数据结构见 ADR-0004 第 4 节,核心:

```json
{
  "versions": [
    {
      "version": 1,
      "effectiveFromChapterId": "chapter_001",
      "previewReferenceAssetId": "...",
      "primaryReferenceAssetId": "...",
      "primaryReferenceKind": "final_reference",
      "promptFragment": "...",
      "finalizedAt": "...",
      "createdAt": "..."
    }
  ]
}
```

任务:

| 任务 | 说明 |
| --- | --- |
| T1 类型定义 | `packages/shared/src/dto.ts` 新增 `CharacterVersion` 接口;`ProjectCharacter` 增加 `versions: CharacterVersion[]` |
| T2 字段迁移 | 废弃单值字段 `previewReferenceAssetId`/`previewConfirmedAt`/`primaryReferenceAssetId`/`primaryReferenceKind`/`visualVersion`/`finalizedAt`;全部改为读写 `versions[currentVersionIndex]` |
| T3 老数据迁移 | 在 `normalizeProjectCharacter`(projects.service.ts:3753)加幂等迁移:单值字段存在时转成 `versions: [{version:1, effectiveFromChapterId: 项目首章, ...}]` |
| T4 查询方法 | 新增 `getEffectiveVersionForChapter(character, chapterId)`:找 `effectiveFromChapterId ≤ chapterId` 的最新版本 |
| T5 创建新版本接口 | 新增 `createCharacterVersion(projectId, characterId, input)`:取老版本角色图喂 AI → 生成 v(N+1) 预览图 → 走定稿流程;`effectiveFromChapterId` = 当前章 |
| T6 路由 | `POST /projects/:id/characters/:cid/versions` |
| T7 前端 | 老角色卡片 `⋯ 更多` 菜单 + 「创建新版本」交互;角色库全量视图展示版本历史(旧版本只读不可删) |

### 4.2 章节出场关系

数据结构:

```json
{
  "chapterId": "chapter_001",
  "characterId": "char_linxia",
  "appeared": true,
  "shotCount": 8,
  "hasDialogue": true,
  "hasCloseUp": true,
  "firstSeenShotId": null
}
```

任务:

| 任务 | 说明 |
| --- | --- |
| T8 类型与存储 | `ProjectCharacter` 同级新增 `appearances` 数组;持久化进 `characters.json` |
| T9 写入触发 | `confirmChapterStoryStructure`(projects.service.ts:1115)确认剧情结构时,从 structureJson 提取本章角色,写 `CharacterAppearance` 记录 |
| T10 出图准备读取 | `imagePreflight` 改为读 appearances + versions,判断本章出场必需角色是否有有效版本三视图 |
| T11 级联清理 | 章节删除时清理对应 appearance 记录 |

## 5. 影响面参考(2026-06-18 探索结果)

- 后端单值字段引用:`projects.service.ts` 约 94 处、`dialogue.service.ts` 1 处
- 前端单值字段引用:`CharacterImageList.vue`/`ImagePreflightWorkspace.vue`/`ProjectCharactersWorkspace.vue`/`workbench-store.ts` 约 13 处(全只读)
- 持久化:`characters.json`,`writeProjectFiles`(projects.service.ts:3070)写,`normalizeProjectCharacter`(3753)读
- 自动生成触发点:`ensureProjectCharacterPreviewTasks` 三处(416/470/1145)

## 6. 退出标准

- 老项目数据迁移后角色不丢失,versions[0] 正确生成。
- 创建新版本后,旧章节仍显示旧版本图,新章节显示新版本。
- 出图准备能正确识别本章出场角色并检查三视图。
- 章节删除后 appearance 记录级联清理。
- typecheck/build 通过。

## 7. 风险

| 风险 | 应对 |
| --- | --- |
| 95 处字段改造漏改 | 分方法逐个改,改完跑 typecheck 全量验证 |
| 老数据迁移不幂等 | 迁移逻辑判断 `versions` 已存在则跳过 |
| 版本切换影响已生成候选图 | 语义 A(章节锚定),旧章节永不重生成,见 ADR-0004 规则 20-21 |
