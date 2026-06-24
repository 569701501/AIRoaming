# ProjectStore 骨架抽取(第五轮)

---
doc_id: AIR-TASK-PROJECT-STORE
status: completed
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: ProjectsService 拆分第五轮(解骨架耦合,为 CharacterReferenceService 铺路)
---

## 1. 背景

第四轮发现角色编排与 Service 骨架深度耦合。本轮抽 ProjectStore 收口骨架,解耦 writeProjectFiles 的 referenceTaskChecker 回调。详见 findings.md。

## 2. 目标

1. 抽 `ProjectStore`:getReadyProject / writeProjectFiles / ensureDefaultChapterReady / selectCurrentChapter / ensureProjectsLoaded。
2. writeProjectFiles 的 hasActiveCharacterReferenceTask 耦合改为 referenceTaskChecker 回调注入。
3. ProjectsService 71 处调用改委托。
4. 为下一轮 CharacterReferenceService 铺路(骨架独立)。

## 3. 非目标

- 不抽 CharacterReferenceService(下一轮)。
- 不改 ADR-0005 调用面。
- 不改业务行为。

## 4. 阶段

### 阶段 1:创建 ProjectStore + 迁入骨架
### 阶段 2:ProjectsService 改委托 + referenceTaskChecker 绑定
### 阶段 3:验证 + Scrutiny + 文档

## 5. 退出标准

- [ ] ProjectStore 抽出。
- [ ] Service 行数下降(3272 → ~3050)。
- [ ] typecheck + test 全绿。
- [ ] Scrutiny 通过。
