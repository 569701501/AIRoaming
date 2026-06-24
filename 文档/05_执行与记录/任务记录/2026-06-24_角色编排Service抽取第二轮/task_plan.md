# 角色编排 Service 抽取(第六轮)

---
doc_id: AIR-TASK-CHARREF-SVC2
status: paused
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: ProjectsService 拆分第六轮(骨架独立后,搬走角色编排)
---

## 1. 背景

第五轮 ProjectStore 解开骨架循环。本轮搬走角色编排(644行编排+辅助)到 CharacterReferenceService,ProjectsService 保留薄门面(ADR-0005)。详见 findings.md。

## 2. 目标

1. 抽 CharacterReferenceService:12 编排 + ~15 辅助 + characterReferenceQueue。
2. ProjectsService 保留 12 薄门面委托。
3. hasActiveCharacterReferenceTask 搬到 CharacterReferenceService,referenceTaskChecker 改转发。

## 3. 非目标

- 不改 ADR-0005 调用面。
- 不改业务行为。
- 不动 syncStoryStructureCharacters(结构确认流程)。

## 4. 退出标准

- [ ] CharacterReferenceService 抽出。
- [ ] Service 行数显著下降(3184 → ~2400)。
- [ ] typecheck + test 全绿。
- [ ] 调用面不变。
- [ ] Scrutiny 通过。

## 5. 暂停决策(2026-06-24)

**状态:paused。迁移规格已就绪,执行推到新会话。**

理由(findings §8):
- 迁移规模 ~1000 行/31 方法,迄今最大单轮。
- 当前会话已 6 轮拆分,长上下文下执行大迁移可靠性下降。
- 核心架构价值(循环依赖解开)已由第五轮 ProjectStore 达成。
- CharacterReferenceService 抽取是代码组织优化,架构价值递减。

Agent 已产出完整迁移规格(findings §9),下一轮可直接执行。
