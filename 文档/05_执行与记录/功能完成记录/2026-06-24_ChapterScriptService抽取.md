# ProjectsService 拆分第七轮:ChapterScriptService

---
doc_id: AIR-DONE-2026-06-24-CHAPSCRIPT
status: active
created: 2026-06-24
updated: 2026-06-24
owner: AI漫游项目
source: 任务 2026-06-24_ChapterScriptService抽取
---

## 1. 功能摘要

抽出 ChapterScriptService(章节剧本编排,726 行),Service 从 2212 → 1650 行(-562)。这是 ProjectsService 最后一个大职责域。门面委托模式(ADR-0005)。

## 2. 影响范围

仅后端。数据结构/协议/路径不变。调用面不变(13 门面委托)。

## 3. 修改文件

| 文件 | 变化 |
| --- | --- |
| projects.service.ts | 2212 → 1650;13 门面委托;删 3 私有;注入 chapterScript |
| chapter-script.service.ts(新) | 726 行;16 方法 |
| projects.module.ts | 注册 ChapterScriptService |
| projects.service.source-guard.spec.ts | 补第 8 参数 mock + 校验行为 |

## 4. 验证

typecheck 三包通过;61 tests 全绿。

## 5. 后续建议

Service 1650 行已是健康状态(剧情结构/分镜/workbench装配/项目CRUD + 门面委托)。进一步拆分收益递减。
