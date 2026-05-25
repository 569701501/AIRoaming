# 项目创建字段与本地 workspace 完成记录

---
doc_id: AIR-EXEC-COMPLETION-PROJECT-CREATE-FIELDS-001
status: active
created: 2026-05-24
updated: 2026-05-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 项目创建链路、核心数据模型、素材文件与版本契约
---

## 1. 功能摘要

项目创建链路已补齐故事标题、题材标签、漫画格式和画风方向四个字段，并在创建项目时由后端写入本地 workspace 项目目录。

## 2. 存储结论

当前阶段内部使用，采用：

```text
前端提交创建请求
  -> 后端校验和保存项目元数据
  -> 后端写入本地 workspace/projects/{projectId}
```

真实素材、项目元数据和故事原文放在用户本地 workspace；前端不直接写物理路径，数据库或内存记录只保存元数据和逻辑路径。后续如需云端或团队共享，替换后端 workspace / asset 适配层。

## 3. 影响范围

| 类型 | 范围 |
| --- | --- |
| 共享契约 | `packages/shared/src/domain.ts`、`packages/shared/src/dto.ts` |
| 后端 | `apps/server/src/projects/`、`apps/server/src/workspace/workspace-path.service.ts` |
| 前端 | `apps/web/src/components/projects/CreateProjectModal.vue` |
| 文档 | `AI上下文入口.md`、`当前UI信息架构.md`、`核心数据模型.md`、`素材文件与版本契约.md` |

## 4. 数据或协议变化

`CreateProjectRequest` 和 `ProjectListItem` 新增：

```json
{
  "storyTitle": "灰烬之光",
  "genreTags": ["悬疑", "都市", "超自然"],
  "comicFormat": "vertical_scroll",
  "artStyle": "dark_realistic"
}
```

新增枚举：

```text
ComicFormat = vertical_scroll | page_horizontal | four_panel
ArtStyle = dark_realistic | semi_realistic | japanese_realistic | comic_style | cyberpunk | custom
```

## 5. 验证结果

| 验证项 | 结果 |
| --- | --- |
| `corepack pnpm build` | 通过 |
| `POST /api/projects` 创建项目 | 通过，响应包含四个新增字段 |
| workspace 文件检查 | 通过，写入 `workspace/projects/{projectId}/project.json` 和 `story/story_draft.source.txt` |

## 6. 已知风险

- 当前项目列表来自进程内存，重启服务后列表不会从 workspace 回读；后续接 SQLite/Prisma 时需要补齐持久化读取。
- 题材标签暂由前端固定选项提交，后续需要做可配置标签或自定义标签保存。

## 7. 后续建议

下一步继续做项目创建后的“进入项目工作区外壳 + 项目与故事”页面，让创建成功后的用户链路闭合。
