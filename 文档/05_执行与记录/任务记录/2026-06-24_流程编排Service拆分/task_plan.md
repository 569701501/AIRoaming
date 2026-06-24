# 流程编排 Service 拆分(第八轮)

---
doc_id: AIR-TASK-FLOWSVC
status: in_progress
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: ProjectsService 拆分第八轮(每个流程一个 service)
---

## 1. 目标

将 ProjectsService 剩余 3 个流程编排各拆成独立 service:
- StoryboardService(分镜,207行)
- StoryStructureService(剧情结构,389行)
- ImagePreflightService(出图准备,286行)

拆完 ProjectsService ≈ 860 行。

## 2. 非目标

- 不改 ADR-0005 调用面。
- 不改业务行为。
- 不动已抽出的 service(CharacterReference/ChapterScript/ImageProvider/ProjectStore)。

## 3. 阶段(低风险→高风险)

### 阶段 1:StoryboardService(分镜)
最独立,零跨域耦合。9 方法。

### 阶段 2:StoryStructureService(剧情结构)
syncStoryStructureCharacters 调 characterRef 6 方法(已 public)。注入 CharacterReferenceService。

### 阶段 3:ImagePreflightService(出图准备)
resolveImagePreflightCharacter 的 normalizeStoryboardJson 改调 storyNormalize(纯函数)。6 个 normalizeImagePreflight 薄委托删,改调 imagePreflightUtil。

## 4. 退出标准

- [ ] 三个 service 抽出。
- [ ] Service ~860 行。
- [ ] typecheck + test 全绿。
- [ ] 调用面不变。
- [ ] Scrutiny 通过。
