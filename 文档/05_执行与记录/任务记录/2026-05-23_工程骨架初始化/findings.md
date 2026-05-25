# 发现与决策

---
doc_id: AIR-TASK-20260523-SCAFFOLD-FINDINGS
status: completed
created: 2026-05-23
updated: 2026-05-23
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

## 需求理解

用户确认继续，因此本次任务从文档与选型推进到实际工程骨架初始化。

## 事实源

| 来源 | 结论 |
| --- | --- |
| `文档/02_架构与契约/系统架构总览.md` | MVP 形态是 Web 工作台核心 + 本地服务，前端不直接调 provider 或写物理路径 |
| `文档/04_方案与决策/ADR-0003_Web优先与桌面壳后置.md` | 桌面端后置，后端 API 是 Web 和未来桌面壳共同边界 |
| `文档/04_方案与决策/2026-05-23_Aurora技术迁移与端形态选型方案.md` | 首批底座是 monorepo、Prisma schema、workspace path、GenerationTask、SSE、mock provider |
| 当前仓库状态 | 目前只有文档和 `AGENTS.md`，尚未创建代码工程 |
| 验证结果 | 工程骨架创建后 build/typecheck/prisma validate/API smoke 均通过 |

## 研究发现

- 第一版 scaffold 应先保证模块边界和可运行性，不应一次性引入完整 Prisma、BullMQ、真实 provider。
- `GenerationTask` 可以先以内存服务表达 API 和前端状态，后续再替换为 Prisma 持久化。
- workspace 路径 helper 应从 shared 开始定义，server 负责把虚拟路径解析到物理路径。
- 本机全局 `pnpm 7.12.1` 与 Node 22 请求 registry 时出现 `ERR_INVALID_THIS`，需要使用 `corepack pnpm` 按 `packageManager` 指定版本运行。
- `tsx` 开发模式不保留 NestJS 构造器注入 metadata，controller 需要显式 `@Inject(...)`，否则运行态 service 为 `undefined`。

## 风险

| 风险 | 处理 |
| --- | --- |
| 首次依赖安装可能受网络或版本影响 | 记录命令结果，必要时保留 package 配置并说明未验证项 |
| NestJS 与 Vite 版本可能存在 Node/TypeScript 兼容问题 | 优先采用稳定基础能力，验证 build/typecheck |
| 内存任务服务不是最终方案 | 在代码与完成记录中明确这是 scaffold 阶段临时实现 |
| Browser 自动化工具不可用 | 使用构建、HTTP 入口和 API smoke 替代，后续 UI 复杂化后补截图 |

## 技术决策

| 决策 | 依据 |
| --- | --- |
| monorepo 使用 `apps/*` 和 `packages/*` | 与 Aurora 和 ADR-0003 对齐 |
| shared 包输出 TypeScript 类型和工具 | 让前后端共享任务、项目、workspace 契约 |
| 后端先提供 REST，不先做 SSE | 第一阶段先验证 API 与任务状态，SSE 可作为下一步 |
| 前端先做工作台壳和任务中心壳 | 保持产品方向可见，为 M1/M2 UI 留空间 |
| Prisma schema 先落地但不接入运行服务 | 保持数据契约可见，避免首次 scaffold 同时处理迁移和服务持久化 |
