# 项目工作区外壳与故事面板发现记录

---
doc_id: AIR-TASK-20260524-WORKBENCH-STORY-FINDINGS
status: completed
created: 2026-05-24
updated: 2026-05-24
owner: AI漫游项目
audience: human, ai-agent, developer
source: 事实源阅读、代码探索
---

## 1. 需求理解

用户要求继续做下一个功能，并显式调用 `$deep-think`。结合当前事实源，下一段最合理链路是：

```text
项目库
  -> 创建 / 打开项目
  -> 项目工作区
  -> 项目与故事
```

## 2. 关键发现

| 发现 | 证据 |
| --- | --- |
| 当前 `AppShell` 始终渲染项目库 | `apps/web/src/components/layout/AppShell.vue` |
| `openProject` 已设置 `activeProjectId` 并拉取 `WorkbenchSnapshot` | `apps/web/src/stores/workbench-store.ts` |
| 后端已有 `GET /projects/:projectId/workbench` | `apps/server/src/projects/projects.controller.ts` |
| 后端暂无保存故事草稿接口 | `apps/server/src/projects/projects.service.ts` |
| 当前 snapshot stages 还不是 6 步命名 | `apps/server/src/projects/projects.service.ts` |

## 3. 决策

| 决策 | 理由 |
| --- | --- |
| 不引入前端路由 | 当前只有两层视图，用 `activeProjectId` 足够，避免提前复杂化 |
| 增加 PATCH 项目接口 | 项目与故事面板需要真实保存，不应只做前端假状态 |
| 项目内 6 步后续页灰态 | 保持功能诚实，避免伪装未实现能力 |

## 4. 风险

- 进程内项目数据重启后丢失，workspace 文件不会自动回读。
- `AI 分析剧情` 当前只能创建 mock task，尚不生成结构化剧情。

## 5. 复核占位

### 5.1 Scrutiny Review

| 检查项 | 结论 |
| --- | --- |
| 共享 DTO | `UpdateProjectDraftRequest` 已加入共享契约，前后端共用 |
| API 路由 | `PATCH /api/projects/{projectId}` 与已有 `GET/POST/DELETE` 不冲突 |
| 6 步命名 | `WorkbenchSnapshot.stages` 已改为当前文档的 6 步 |
| UI 范围 | 只实现项目工作区外壳和“项目与故事”，未伪装后续步骤真实可用 |
| 文件写入 | 草稿保存由后端写入 workspace，前端不直接写物理路径 |

### 5.2 Runtime/User Review

| 用户路径 | 结论 |
| --- | --- |
| 项目库进入工作区 | 通过 |
| 工作区返回项目库 | 通过 |
| 保存故事草稿 | 通过，`story/story_draft.source.txt` 更新 |
| 6 步流程展示 | 通过，页面显示 6 个阶段 |
| AI 分析剧情按钮 | 通过，创建 `story_parse` mock 任务 |
