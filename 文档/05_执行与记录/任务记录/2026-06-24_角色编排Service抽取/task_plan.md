# 角色编排 Service 抽取(第四轮)

---
doc_id: AIR-TASK-CHARREF-SVC
status: paused
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: ProjectsService 拆分第四轮(第三轮破循环后,搬走角色编排)
---

## 1. 背景

第三轮抽出 ImageProviderService 打破循环依赖。现在可把角色参考图编排(644 行)整体搬入 CharacterReferenceService,ProjectsService 保留薄门面委托(ADR-0005)。详见 findings.md。

## 2. 目标

1. 抽 `CharacterReferenceService`:角色/场景参考图编排逻辑 + 内部辅助方法。
2. ProjectsService 保留 12 个薄委托门面方法(签名不变)。
3. Service 行数显著下降。

## 3. 非目标

- 不改 ADR-0005 调用面(Controller/ToolCallback/Dialogue 调法不变)。
- 不改业务行为。
- 不动 syncStoryStructureCharacters(属结构确认流程)。

## 4. 阶段

### 阶段 1:创建 CharacterReferenceService + 迁入逻辑
- 创建 service,注入 repository/tasksService/imageProvider/workspacePathService。
- 迁入编排方法 + 内部辅助 + characterReferenceQueue 私有状态。
- 门面方法签名对齐。

### 阶段 2:ProjectsService 改薄委托
- 12 个门面方法改为 `return this.characterRef.foo()`。
- 删除迁走的内部辅助方法。
- 注入 CharacterReferenceService。

### 阶段 3:验证 + Scrutiny + 文档

## 5. 退出标准

- [ ] CharacterReferenceService 抽出。
- [ ] Service 行数显著下降(3272 → ~2700)。
- [ ] typecheck + test 全绿。
- [ ] 调用面不变。
- [ ] Scrutiny 通过。

## 6. 暂停决策(2026-06-24 Orchestrator)

**状态:paused。无代码变更。**

精读后发现角色编排与 Service 骨架深度耦合(writeProjectFiles 反向依赖 hasActiveCharacterReferenceTask;编排方法深度依赖 getReadyProject/writeProjectFiles 71 处调用的核心骨架)。整体搬走风险过高。

正确的下一轮应先抽 ProjectStore(收口骨架),详见 findings §8-9。
