# 打通主链路闭环 · 任务计划

---
doc_id: AIR-TASK-20260709-MAIN-LOOP
status: active
created: 2026-07-09
updated: 2026-07-09
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户要求「先思考再写，完成整个链路」
---

## 1. 目标

把漫画主链路从「出图准备之后」补到可交付：

```text
候选图真实生成/落库 → 选择锁定 → 排版导出 → 素材包
```

使本章可以从 `storyboard_done + preflight` 推进到 `images_done → layout_done → exported`，并在 workspace 留下可追溯产物。

## 2. 非目标

- 不进轻漫剧（TTS / 字幕 / MP4 / FFmpeg）。
- 不做复杂印刷级排版、拖拽格子编辑器、多模板设计器。
- 不强制把 Chapter/Candidate 迁入 Prisma 数据库（继续 workspace JSON + Asset 文件）。
- 不重做角色库、剧情结构、分镜已有闭环。
- 不新增大依赖（sharp / pdfkit / archiver）；MVP 导出为有序 PNG 序列 + 目录型素材包 + manifest。

## 3. 现状结论（探索证据）

| 环节 | 现状 |
| --- | --- |
| 候选图 UI | 已有 `ImageCandidatesWorkspace`，可创建 `image_generate` 任务 |
| 任务执行 | `TasksService.create` 走 mock worker，不落真实图 |
| Candidate | `WorkbenchSnapshot.candidates` 恒为空；无 `candidates.json` 读写 |
| 锁定 | `Shot.lockedCandidateId` 字段存在，无锁定 API |
| 章节推进 | workflow 支持 `images_done/layout_done/exported`，无人写入 |
| 排版/素材包 UI | `ProjectWorkbenchView` 仍是占位面板 |
| 图片 provider | 角色图已有 `ImageProviderService`，可复用 |

## 4. 关键决策

| 决策 | 选择 | 理由 |
| --- | --- | --- |
| 生图执行 | 复用 `ImageProviderService` + `createControlled` 真 worker | 与角色图一致；mock 无法完成链路 |
| 候选持久化 | `chapters/{slug}/candidates.json` + 图片文件 | 契约已约定路径；不引入 DB |
| 锁定规则 | 每镜只能锁 1 个候选；锁定写回 `storyboard.json` 的 `lockedCandidateId` | 模型已定义 |
| 推进 `images_done` | 用户点击「完成本章候选图」；要求全部正式镜头已锁定 | 与「完成本章剧本」一致，可人工控 |
| 排版 MVP | 按镜头顺序生成 `layout.json` + 导出有序 PNG（一镜一页/一格） | 无图像合成库也能交付 |
| PDF | 本阶段不做 | 无 pdf 依赖；PNG 序列足够验证导出 |
| 素材包 | 目录包 + `manifest.json`，可选说明 ZIP 后置 | 无 archiver 依赖 |
| 任务拦截 | `TasksService` 支持 type worker；`image_generate` / `layout_export` / `asset_package_export` 走真 worker，不再 mock | 前端可继续 `POST /api/tasks` 或专用 API |

## 5. 阶段划分

### 阶段 A · 候选图闭环（M2 收口）

1. shared：Candidate DTO、章节候选集合、锁定/完成请求响应
2. 后端：`ImageCandidateService` 执行真实 `image_generate`，写 Asset + candidates.json
3. 后端：锁定 / 废弃 / 完成本章候选图 API
4. 快照：`WorkbenchSnapshot.candidates/assets/shots` 填真实数据
5. 前端：展示真实图片、锁定、完成本章、任务成功后刷新
6. 测试：锁定规则、章节状态推进、任务 output 形状

**退出标准**

- 单镜可生成 ≥1 张候选并落盘
- 候选可追溯到 taskId / asset / path
- 一镜只能锁一个候选
- 全镜锁定后可推进 `images_done`，workflow 到 `layout_export`

### 阶段 B · 排版导出（M3 前半）

1. shared：`LayoutPage` / `ChapterLayout` DTO
2. 后端：根据已锁定候选生成 layout 并导出 PNG 序列到 `exports/`
3. 前端：排版工作台（锁定列表预览、生成排版、导出、推进 `layout_done`）

**退出标准**

- 只读已锁定候选
- 导出物有 Asset 记录
- 章节可到 `layout_done`

### 阶段 C · 素材包（M3 后半）

1. 后端：汇总本章/项目产物写 `exports/packages/{packageId}/` + manifest
2. 前端：素材包工作台（预览清单、导出、推进 `exported`）
3. 文档同步、完成记录、静态复核清单

**退出标准**

- 素材包含 manifest，可追溯章节、分镜、候选、导出物
- 章节可到 `exported`
- typecheck + 相关测试通过

## 6. 验收标准（全链路）

用户路径（本章已有正式分镜 + preflight）：

1. 进入候选图 → 为镜头生成候选 → 看到真实图
2. 锁定每个镜头的候选 → 完成本章候选图
3. 进入排版 → 预览锁定图顺序 → 导出 PNG 序列
4. 进入素材包 → 导出目录包 → 打开 manifest 能对应 shot/candidate/asset

## 7. 风险

| 风险 | 缓解 |
| --- | --- |
| 图片 API 未配置导致无法端到端出图 | 错误信息明确；开发可用已有 imageProvider 设置；测试对持久化/锁定用 fixture buffer |
| 任务 mock 与真 worker 混用 | 只对 `image_generate`/`layout_export`/`asset_package_export` 注册 worker |
| 大文件 UI 卡顿 | 用受控 asset file API 预览，不把 base64 塞进 snapshot |
| 范围膨胀 | PDF/ZIP/拖拽排版明确后置 |

## 8. 当前阶段

- [x] Orchestrator 规划
- [x] 阶段 A Worker
- [x] 阶段 B Worker
- [x] 阶段 C Worker
- [x] Scrutiny Review（静态：typecheck + 48/15 tests）
- [ ] Runtime/User Review
