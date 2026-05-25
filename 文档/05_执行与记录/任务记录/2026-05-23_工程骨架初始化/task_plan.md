# 任务计划：工程骨架初始化

---
doc_id: AIR-TASK-20260523-SCAFFOLD-PLAN
status: completed
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户确认继续实现工程骨架
---

## 目标

创建 AI漫游第一版工程骨架，落实 ADR-0003 的 Web 工作台核心、本地 NestJS 服务、shared 契约包和 workspace 路径边界，为后续 Project、Asset、GenerationTask、故事到分镜主链路实现打基础。

## 当前阶段

已完成

## 阶段列表

### 阶段 1：事实源与现状确认
- [x] 读取文档入口、写作规则、深思熟虑契约、MVP、架构、数据模型和 Aurora 技术迁移方案
- [x] 确认仓库当前尚无工程 scaffold
- [x] 确认本机有 Node 与 pnpm
- **状态：** completed

### 阶段 2：工程骨架创建
- [x] 创建 pnpm workspace 根配置
- [x] 创建 `packages/shared`
- [x] 创建 `apps/server`
- [x] 创建 `apps/web`
- [x] 创建 workspace 占位目录
- **状态：** completed

### 阶段 3：最小能力实现
- [x] shared 定义核心枚举、DTO、workspace 路径工具
- [x] server 提供健康检查、workspace 信息、任务创建/查询/取消接口
- [x] web 提供工作台壳、任务中心壳和 API 调用
- **状态：** completed

### 阶段 4：验证与留痕
- [x] 安装依赖
- [x] 运行类型检查或构建
- [x] 更新进度、发现与完成记录
- [x] 更新完成记录索引
- **状态：** completed

## 关键问题

1. 第一版 scaffold 是否能表达 Web 工作台 + 本地后端 + shared 契约边界？
2. 是否能避免前端直接依赖物理路径和 provider key？
3. 是否能为 `GenerationTask` 后续持久化和 SSE 留出扩展位置？

## 已做决策

| Decision | Rationale |
| --- | --- |
| 先创建轻量可运行骨架，不一次性接 Prisma 和真实 provider | 避免首轮 scaffold 过重，先稳定模块边界 |
| 后端任务服务先用内存存储 | 便于验证 API 和 UI，后续再接 Prisma SQLite |
| shared 包先承载枚举、DTO、路径工具 | 防止前后端字段从第一天漂移 |
| 开发命令使用 `corepack pnpm` | 本机全局 pnpm 7.12.1 与 Node 22 请求 registry 存在兼容问题 |

## 退出标准

- 根目录存在 pnpm workspace 配置。
- `apps/web`、`apps/server`、`packages/shared` 存在并可被 pnpm 识别。
- 前端可调用后端健康检查和任务 API。
- 后端不让前端决定物理路径。
- 验证命令有记录，失败时说明原因。
