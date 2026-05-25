# ADR-0003 Web 优先与桌面壳后置

---
doc_id: AIR-ADR-0003
status: active
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: AuroraPlatformWeb 技术迁移评估与端形态选型
---

## 1. 状态

已采纳。

## 2. 背景

AI漫游需要决定第一阶段应用形态：纯 Web、纯桌面端，还是 Web 核心加桌面壳。用户同时希望参考 AuroraPlatformWeb 的成熟技术，并纠结是否应该直接做桌面端。

AuroraPlatformWeb 已经验证了以下能力：

- Vue 3 工作台可以承载复杂创作界面。
- NestJS + Prisma 适合承载项目、任务、素材、provider 等模块。
- `material-task` 异步任务模式适合处理图片、音频、序列帧等长耗时素材生成。
- SSE 可以为前端提供任务进度和完成事件。
- workspace 路径契约可以隔离前端路径和后端物理文件。

但 Aurora 同时包含 Docker 沙盒、OpenCode runtime、Redis、PostgreSQL、计费、团队、微信通道、预览运行时等复杂系统。AI漫游 MVP 的目标是故事到漫画/轻漫剧创作闭环，不应全量复制这些系统。

## 3. 决策

AI漫游第一阶段采用：

```text
Web 工作台优先
  + 本地 NestJS 服务
  + Prisma SQLite
  + 本地 workspace 文件系统
  + 本地任务 worker
  + provider adapter
```

桌面端不作为 MVP 起点。后续如果需要桌面体验，在 Web 核心稳定后再评估 Electron 或 Tauri 包装。

## 4. 理由

| 判断 | 理由 |
| --- | --- |
| 不纯桌面端优先 | 桌面打包、更新、签名、跨平台、本地权限会过早消耗精力 |
| 不纯云端 Web 优先 | AI漫游会产生大量图片、音频、视频和导出物，本地文件与 FFmpeg 很重要 |
| Web 核心优先 | 可最大化复用 Aurora 的前端、后端、任务中心和素材管理经验 |
| 本地后端优先 | 可统一管理文件、provider key、FFmpeg、任务和 workspace |
| 桌面壳后置 | 保留桌面体验可能性，同时避免 MVP 前陷入包装技术选择 |

## 5. 约束

从第一版开始必须遵守：

- 前端不能直接读写物理文件路径。
- 前端不能持有 provider key。
- 所有生成和导出必须进入任务系统。
- 数据库中的文件引用优先保存 workspace 相对路径或虚拟路径。
- 后端 API 是 Web 和未来桌面壳的共同边界。
- 任务、素材、导出物必须可追溯。

## 6. 影响

### 正向影响

- 可以更快开始 M1-M3 主链路。
- 能复用 Aurora 的工作台和异步任务经验。
- 后续可在不重写 UI 的情况下桌面化。
- 本地文件和导出能力从架构上被保留。

### 代价

- MVP 仍需要用户启动本地服务或通过脚本启动。
- 未来桌面打包时需要处理后端进程、workspace 位置和依赖分发。
- 如果很早进入多人协作，需要重新评估 SQLite 和本地 worker。

## 7. 后续触发条件

| 触发条件 | 后续动作 |
| --- | --- |
| 用户需要一键安装和双击启动 | 评估 Electron/Tauri 桌面壳 |
| 用户需要多人协作和远程访问 | 评估 PostgreSQL、对象存储、部署环境 |
| 任务并发和失败恢复成为瓶颈 | 引入 BullMQ + Redis |
| 本地模型、FFmpeg、文件权限成为核心卖点 | 优先评估桌面壳和本地运行时管理 |

## 8. 不做事项

第一阶段不做：

- 完整云端多租户。
- 计费和积分系统。
- 团队权限系统。
- Docker 沙盒运行时。
- OpenCode agent runtime 全量集成。
- 桌面原生 UI 重写。

## 9. 验收

- 架构文档明确 Web 优先、本地服务、桌面壳后置。
- 方案文档列出 Aurora 可迁移技术、需改造技术和暂缓技术。
- 后续工程 scaffold 遵守 `apps/web`、`apps/server`、`packages/shared` 分层。
- 第一批功能以 `GenerationTask` 和 workspace 路径作为核心契约。
