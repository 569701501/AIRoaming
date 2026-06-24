# ProjectsService 拆分第六轮:CharacterReferenceService

---
doc_id: AIR-DONE-2026-06-24-CHARACTER-REF-SVC
status: active
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 任务 2026-06-24_角色编排Service抽取第二轮
---

## 1. 功能摘要

抽出 `CharacterReferenceService`(角色/场景参考图编排,902 行),ProjectsService 保留 12 个薄门面委托(ADR-0005)。循环依赖在前几轮已解开(第三轮 ImageProvider + 第五轮 ProjectStore),本轮完成最后的角色编排整体搬迁。Service 从 3184 → 2212 行(-972)。

## 2. 影响范围

- 仅后端 apps/server/src/projects/。数据结构/协议/路径不变。
- 调用面:Controller/ToolCallback/DialogueService 调 ProjectsService 不变(薄门面)。

## 3. 修改文件

| 文件 | 变化 |
| --- | --- |
| projects.service.ts | 3184 → 2212(-972);12 门面委托;删 32 私有方法;注入 characterRef |
| character-reference.service.ts(新) | 902 行;12 编排 + 18 辅助 + 角色纯函数 + queue |
| projects.module.ts | 注册 CharacterReferenceService |
| projects.service.source-guard.spec.ts | 补第 7 个构造参数 mock |

## 4. 数据或协议变化

无。方法体逐字迁移。6 个辅助方法(findProjectCharacter/hasActive/inferCharacterLevel/resolve*)在 CharacterReferenceService 改 public,供 Service 留方法调用。

## 5. 验证

| 命令 | 结果 |
| --- | --- |
| corepack pnpm -w typecheck | ✅ 三包通过 |
| corepack pnpm test | ✅ 61 tests 全绿 |

## 6. 已知风险

- resolveImagePreflightCharacter 留 Service(耦合分镜),通过 this.characterRef 调角色辅助。
- CharacterReferenceService 无独立单测,靠集成路径间接覆盖。

## 7. 后续建议

- 补抽 resolveImagePreflightCharacter 到独立 preflight service(解分镜耦合)。
- 角色纯函数(normalize*/resolve*)可补抽到 character-domain.util。
- 给 CharacterReferenceService 补单测。
