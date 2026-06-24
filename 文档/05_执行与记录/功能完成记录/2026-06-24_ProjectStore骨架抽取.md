# ProjectsService 拆分第五轮:ProjectStore 骨架

---
doc_id: AIR-DONE-2026-06-24-PROJECT-STORE
status: active
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 任务 2026-06-24_ProjectStore骨架抽取
---

## 1. 功能摘要

抽出 `ProjectStore`(项目读写骨架),收口 getReadyProject/writeProjectFiles/ensureDefaultChapterReady 等 71 处调用的核心方法。**解开了第四轮发现的骨架↔角色编排循环耦合**(writeProjectFiles 不再直接调 hasActiveCharacterReferenceTask,改 referenceTaskChecker 回调注入)。为下一轮 CharacterReferenceService 铺路。纯收口,行为与调用面不变(ADR-0005 不破)。

## 2. 影响范围

- 仅后端 `apps/server/src/projects/`。
- 数据结构、任务协议、文件路径、异步状态:全部不变。
- 调用面:Controller/ToolCallback/DialogueService 调 ProjectsService 不变。

## 3. 修改文件

| 文件 | 变化 |
| --- | --- |
| `projects.service.ts` | 3272 → 3184(-88);删骨架方法;71 处改 projectStore 委托;onModuleInit 绑定 referenceTaskChecker |
| `project-store.service.ts`(新) | 137 行;getReady/write/ensureDefault/selectCurrent + 辅助 |
| `projects.module.ts` | 注册 ProjectStore |
| `projects.service.source-guard.spec.ts` | 补第 6 个构造参数(ProjectStore mock) |

## 4. 数据或协议变化

无。骨架方法逻辑体逐字迁移。唯一架构变化:writeProjectFiles 的角色任务状态查询从直接调用改为回调注入(referenceTaskChecker)。

## 5. 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm -w typecheck` | ✅ 三包通过 |
| `corepack pnpm test` | ✅ 61 tests 全绿 |
| Scrutiny | ✅ 通过(findings §9) |

## 6. 已知风险

- referenceTaskChecker 懒绑定有时序假设(onModuleInit 先于请求)。Nest 保证,风险可控。
- ProjectStore 无独立单元测试,靠集成路径间接覆盖。

## 7. 后续建议

- **抽 CharacterReferenceService**(下一轮):骨架已独立,角色编排可依赖 ProjectStore 而非 ProjectsService,循环彻底解开。
- 补抽角色纯函数到 character-domain.util。
- 给 ProjectStore 补单测。
