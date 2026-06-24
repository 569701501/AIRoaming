# ProjectsService 拆分第二轮:剧本导入分析

---
doc_id: AIR-DONE-2026-06-24-PROJSPLIT2
status: active
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 任务 2026-06-24_ProjectsService拆分第二轮(上轮候选 D 遗留)
---

## 1. 功能摘要

`projects.service.ts` 抽出剧本导入分析的 9 个纯算法方法为 `script-import.util.ts`。纯收口重构,行为与调用面不变(ADR-0005 不破)。这是上轮拆分(2026-06-22)明确遗留的候选 D,本轮完成后 D 彻底清零。

## 2. 影响范围

- 仅后端 `apps/server/src/projects/`,前端无改动。
- 数据结构、任务协议、workspace 文件路径、异步状态:全部不变(契约核查通过)。
- 调用面:analyzeScriptImport / importScriptToChapters 签名与返回不变。

## 3. 修改文件

| 文件 | 变化 |
| --- | --- |
| `projects.service.ts` | 3730 → 3518 行(-212);删 9 方法 + 4 类型定义;8 调用点改委托;移除 2 个不再用的 shared import |
| `script-import.util.ts`(新) | 231 行;9 纯算法方法 + 4 类型 |
| `script-import.util.spec.ts`(新) | 24 个测试 |

## 4. 数据或协议变化

无。纯收口,数据结构与协议不变。9 个方法是零外部依赖的纯函数(不碰 repository/tasks/workspacePath),迁移仅去掉 `private`/`this.`,逻辑体逐字一致。

## 5. 验证命令与结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm -w typecheck` | ✅ shared/web/server 三包通过 |
| `corepack pnpm test` | ✅ shared 15 + server 46 = 61 tests 全绿 |
| Scrutiny 静态复核(调用面/残留/行为等价) | ✅ 通过,见任务目录 findings §8 |
| Runtime/User Review | ✅ 无 UI,命令验证通过 |

## 6. 已知风险

- 候选 D 已清零,但 Service 仍 3518 行。最大遗留(角色参考图编排 ~622 行)未动——需先解 `requestOpenAi*` 循环依赖(抽 ImageProvider 网关),另立任务。
- 本轮无单测保护编排方法(analyzeScriptImport/importScriptToChapters 本身),只测了抽出的纯算法。编排方法的行为靠现有集成路径间接覆盖。

## 7. 后续建议

- **角色参考图编排拆分**(Service 最大遗留块):先抽 `ImageProvider` 网关(requestOpenAiImage/requestOpenAiImageEdit),解循环依赖后再抽 `CharacterReferenceService`。这是下一轮拆分的核心目标。
- 给 analyzeScriptImport/importScriptToChapters 补集成测试(覆盖编排→util 委托链路)。
- 考虑把 `extractMainCharactersSection`(角色提取辅助,当前留 Service)归入角色相关 util。
