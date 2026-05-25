# 发现与决策

---
doc_id: AIR-TASK-20260523-AURORA-TECH-FINDINGS
status: completed
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 需求

- 参考 AuroraPlatformWeb 的技术，判断哪些适合用到 AI漫游。
- 重点回答 AI漫游是否应该做桌面端，还是先做其他形态。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/package.json` | Aurora 是 pnpm workspace，按 web/server/shared 组织，适合 AI漫游复用工程边界 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/README.md` | Aurora 同时管理前端、后端、数据库、Redis、沙盒、浏览器节点和预览运行时，证明架构成熟但复杂度较高 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/web/package.json` | Vue 3、Vite、Pinia、Tailwind、reka/radix、lucide、流式 Markdown 等适合构建创作工作台 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/server/package.json` | NestJS、Prisma、BullMQ、Sharp、图片/音频 provider 和测试工具可作为后端参考 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/server/prisma/schema.prisma` | Project、SandboxSession、MaterialTask 等有参考价值，团队、计费、权限等不适合 MVP 直接迁移 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/server/src/material-task/` | 统一异步任务模型覆盖生成、编辑、处理、音频和序列帧任务，是最值得迁移的后端模式 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/server/src/image-generation/` | 图片 provider adapter、模型能力、输出文件管理可迁移，计费部分应暂缓 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/server/src/common/workspace-path.ts` | `/workspace` 虚拟路径和物理路径安全解析可直接借鉴 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/apps/web/src/features/material-task/task-center.ts` | 前端任务中心通过 SSE 更新任务、通知完成、跳转素材，适合 AI漫游候选图和导出任务 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/文档/模块梳理/后端创造任务迁移模块梳理.md` | 后端创造任务围绕图片、音频、任务中心、provider、workspace 和工具回调组织 |
| `/Users/liyadong/selfProject/AuroraPlatformWeb/文档/模块梳理/前端项目编辑与沙盒联调模块梳理.md` | 前端工作台将项目加载、编辑页、素材面板、任务中心、预览分离，适合 AI漫游参考 |

## 研究发现

- Aurora 最值得迁移的是“工作台 + 异步任务 + 素材库 + provider adapter + workspace 路径”的组合，而不是完整沙盒平台。
- AI漫游的主链路是故事、分镜、图片候选、排版、导出，与 Aurora 的素材任务中心高度相似。
- `material-task` 可泛化为 `GenerationTask`，覆盖 `story_parse`、`shot_generate`、`image_generate`、`layout_export`、`tts_generate`、`video_export` 等任务。
- SSE 已足够支撑 MVP 任务事件推送，不需要一开始引入复杂 WebSocket。
- Aurora 的 PostgreSQL、BullMQ、Redis 能力成熟，但 AI漫游 MVP 可先用 SQLite 和进程内 worker 固化协议。
- 桌面端的真实价值在本地文件、FFmpeg、本地模型和一键启动，但过早做纯桌面端会增加打包、更新和跨平台复杂度。
- 纯 Web/SaaS 便于协作和部署，但对本地素材、隐私、FFmpeg、provider key 和大文件管理不够友好。
- 最合理路线是 Web 工作台核心先行，同时用本地后端和 workspace 保留桌面化条件。

## 缺口与风险

- 尚未创建实际工程 scaffold，技术方案需要在 M1 工程初始化时验证。
- SQLite 到 PostgreSQL 的迁移需要 Prisma schema 保持克制，避免使用不可迁移特性。
- 本地任务 worker 在崩溃恢复、并发控制、任务锁方面需要单独设计。
- 如果未来做桌面壳，需要处理后端进程启动、FFmpeg 分发、workspace 选择和自动更新。
- 如果很早进入多人协作，需要提前切 PostgreSQL、对象存储和用户权限。

## 技术决策

| 决策 | 依据 |
| --- | --- |
| 采用 Web 工作台核心 + 本地后端 + 本地 workspace | 复用 Aurora 工作台和任务模式，同时保留本地素材、FFmpeg 和未来桌面化空间 |
| 桌面壳后置 | 桌面端有价值，但不应在 MVP 前消耗包装和跨平台成本 |
| 直接采用 monorepo、Vue、NestJS、Prisma、shared、workspace 路径、SSE、任务中心模式 | 这些能力与 AI漫游主链路强相关，且不会过早引入平台复杂度 |
| 改造后采用 BullMQ、Redis、PostgreSQL、ProviderCredential、Sharp、FFmpeg、预览运行时 | 这些能力有价值，但应等任务并发、生产部署、素材处理或视频导出需求出现 |
| 暂不采用完整 Docker 沙盒、OpenCode runtime、计费、团队权限、微信通道 | 与 AI漫游 M1-M3 主链路不直接相关，迁移成本大 |
