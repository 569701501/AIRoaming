# 角色参考图编排拆分(第三轮)

---
doc_id: AIR-TASK-CHARREF-SPLIT
status: completed
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: ProjectsService 拆分第三轮(前两轮遗留的最大块)
---

## 1. 背景

Service 3518 行,最大遗留块是角色/场景参考图编排(~622 行)。上两轮因"循环依赖未解"未动。本轮先抽 ImageProvider 网关打破循环。详见 findings.md。

## 2. 目标

1. 抽 `ImageProviderService`:6 个出图 HTTP 方法 + provider 配置解析。
2. generateCharacterReference/generateSceneReference 改委托 ImageProviderService。
3. 补抽角色相关纯函数到 character-domain.util。
4. Service 行数下降。

## 3. 非目标

- 不抽 CharacterReferenceService(整体搬编排方法,改调用面)——留下一轮。
- 不改 ADR-0005 调用面。
- 不改业务行为。

## 4. 阶段

### 阶段 1:抽 ImageProviderService
- 6 出图方法 + 配置解析 → ImageProviderService(注入 settingsService)。
- 对外 generateImage/editImage,内部 doubao/openai 分流。
- Service 改委托。

### 阶段 2:补抽角色纯函数
- extractCharactersFromProjectSource / withUpdatedProjectCharacter 等补进 character-domain.util。

### 阶段 3:验证 + Scrutiny + 文档

## 5. 退出标准

- [x] ImageProviderService 抽出（311 行，6 出图方法 + 配置解析）。
- [x] Service 行数下降：3518 → 3272（-246 行）。
- [x] typecheck 三包 + 61 tests 全绿。
- [x] Scrutiny 通过（见 findings §9）。循环依赖打破。

## 6. 范围调整

阶段 2（角色纯函数补抽）推迟到下一轮——本轮核心目标（破循环）已达成，纯函数抽取是机械工作适合独立做。详见 findings §8。
