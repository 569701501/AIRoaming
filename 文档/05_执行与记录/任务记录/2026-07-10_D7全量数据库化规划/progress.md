---
doc_id: AIR-TASK-20260710-D7-DATABASE-PROGRESS
status: completed
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 进度日志：D7 全量数据库化规划

## 2026-07-10

### 阶段 1：事实源与代码盘点

- **状态：** completed
- 用户确认继续 D7；既定方向仍为“立即全量数据库化”，本任务负责把它拆成安全、可回滚的迁移方案。
- 已读取项目文档入口、写作规则、长期记忆、架构/数据/任务/素材契约，以及 ADR-0009、ADR-0010、ADR-0011。
- 本轮只研究、讨论和写文档，未修改业务代码、Prisma schema、数据库或 workspace 业务数据。
- 已核实 Prisma lockfile 为 6.19.3；schema 只有 6 个模型，无 migration 目录、数据库文件、PrismaService 或业务 CRUD。
- 已核实 `ProjectRepository` 以 Map + workspace 整树顺序写入为事实源；剧本、结构、分镜、候选、排版和 workflow 分散在多份 JSON/Markdown。
- 已核实 TasksService、DialogueService、脚本/结构 pending 与图片串行队列依赖进程内 Map/Set/Promise，服务重启无法恢复。
- 当前 workspace 只读样例：1 项目、2 章、82 文件、约 54 MB、67 Asset、12 Character、15 Shot、27 Candidate；现有 Asset/角色/候选引用均完整。
- 55 个唯一 taskId 中只有 1 个存在 task artifact，54 个只能恢复有限来源；D76 需用独立 record/provenance 语义保留引用，不能把它们伪装为普通成功任务。

### 阶段 2：目标事实源与数据分层

- **状态：** completed
- 已定义数据库为唯一业务事实源；大文件继续由 Asset + workspace 承载；文本 key 归 OpenCode、图片 key 归后端 SecretStore；内存只保留可重建运行态。
- 已确认采用“关系核心 + 版本化 Json + 可重建投影”，避免全部拆表或继续保存无版本 JSON 字符串。
- D1、D3、D4/D5 的版式锁定、不可变修订、来源 digest、LayoutDocument 与历史导出要求已纳入目标模型。

### 阶段 3：迁移、切换与回滚方案

- **状态：** completed
- 已拆分 M0–M6：契约/migration、DB 垂直切片、只读审计导入器、影子导入、停写切换、DB-only 观察、收缩旧路径。
- 已明确数据库和文件系统不能共同 ACID，Asset 使用 staged/rename/ready 与恢复扫描；项目删除使用 deleting + OutboxEvent。
- 已明确重新开放写入前可回滚到 file-only 快照；DB-only 产生新写入后只能回滚到 DB-compatible 应用或数据库备份。

### 阶段 4：提议、复核与讨论入口

- **状态：** completed
- 已新增 `2026-07-10_D7全量数据库化迁移与切换方案.md` 和配套 HTML 决策页。
- Prisma/SQLite 官方资料确认：migration history 必须版本化；SQLite Json 在 Prisma 6.2+ 支持但高级过滤有限；SQLite 事务为 Serializable；SQLite/PostgreSQL migration SQL 不能共用；正式回滚不能依赖自动 down migration。
- Scrutiny Review 初步通过，可进入逐项讨论，不可进入实现。
- D7 决策页浏览器复核通过：目标边界、M4 停写切换、D71 选项与独立页回传降级均可交互；根容器 `clientWidth=736`、`scrollWidth=736`，无横向溢出。
- D71 讨论前，全项目决策页曾同步展示 D71 三个选项；当时浏览器复核通过且 736px 无横向溢出。
- 静态验证通过：正式 Markdown frontmatter/围栏、两个决策 fragment 的 JavaScript 语法和 `git diff --check` 均正常；HTML tidy 仅报告 HTML5 `charset/sandbox/referrerpolicy/srcdoc` 兼容提示，无结构错误。
- 用户连续确认 D71 选择 A：切换前做可重复影子导入，正式切换短暂停写；校验通过后 DB-only，旧 JSON/Markdown 只读封存，不建设运行期双写或双向同步。
- 已明确回滚窗口：重新开放写入前可完整恢复 file-only 快照；DB-only 产生新写入后不得直接退回 file-only 版本。
- 用户连续确认 D72 选择 A：首版使用本地 SQLite 单引擎；数据库文件只放应用受控本地目录；保持 PostgreSQL 可迁移，但首版不交付双引擎、双 migration 或在线同步。
- 已明确 PostgreSQL 迁移触发条件：多人协作、远程部署、多服务实例或持续写竞争；届时单独建设 provider-specific migration 与数据搬迁演练。
- D72 落盘后只提出 D73：推荐 A“关系核心 + 版本化 Json + 可重建投影”。
- 决策页已将 D71、D72 标记为已确认并默认进入 D73；浏览器验证 D73 三个选项、独立页降级提示和全项目页同步状态，两个页面根容器均为 `clientWidth=736`、`scrollWidth=736`，无横向溢出。
- 本轮静态复核通过：正式 Markdown frontmatter/围栏、两个 fragment 的 JavaScript 语法和 `git diff --check` 正常；HTML tidy 仅报告既有 HTML5 `charset/sandbox/referrerpolicy/srcdoc` 兼容提示。
- 用户确认 D73 选择 A：关系核心 + 版本化 Json + 可重建投影；正式保存必须让 Json 文档、关系投影和 current 指针同事务一致，投影可重建且不可独立编辑。
- D74 代码核验：`SettingsService` 会把对话、OpenAI 图片、豆包图片和 Grok 图片 key 明文写入 gitignored settings JSON；`syncConfiguredAuth()` 还会把真实对话 key 发送给 OpenCode `/auth`。
- 本次仓库 workspace 未发现实际 `app-settings.json`；用户全局 OpenCode `auth.json` 存在且权限为 `0600`，但本轮未读取内容、不能判断条目归属。
- Apple、Microsoft、Freedesktop 官方资料支持使用系统凭据库保存小型秘密；OpenCode 官方文档确认其 provider 凭据默认进入 `auth.json`。常见 Node 封装 `atom/node-keytar` 已归档，因此当前只锁定 `SecretStore` 契约，不绑定实现库。
- D73 落盘后初次提出 D74：系统凭据库优先 + SecretStore；随后用户澄清 OpenCode 保存文本 key 属于正确边界。
- 决策页已将 D71–D73 标记为已确认并默认进入 D74；浏览器验证 D74 三个选项、独立页降级提示和全项目页同步状态，两个页面根容器均为 `clientWidth=736`、`scrollWidth=736`，无横向溢出。
- D74 同步后静态复核通过：正式 Markdown frontmatter/围栏、两个 fragment 的 JavaScript 语法和 `git diff --check` 正常；HTML tidy 仅报告既有 HTML5 兼容提示。
- 用户确认 D74 修正版 A：文本模型 key 由 OpenCode 自己的本地 auth 文件保存；图片模型由 NestJS 后端直接调用，其 key 必须进入后端 SecretStore，不得在前端、SQLite、普通 JSON、日志、任务或 artifact 中暴露明文。
- D75 代码核验：`TasksService` 以 Map 保存任务并在创建后直接触发 worker，`maxAttempts=1`；Candidate 与 Character/Scene reference 以两个 Promise 链串行，无 lease、heartbeat、backoff、自动重试或重启恢复。
- BullMQ 官方资料确认：其队列建立在 Redis 上，适合多进程/多机器 worker；最坏情况下仍是 at-least-once，stalled job 可能重跑，幂等与来源校验不能省略。
- 当前只提出 D75：推荐 A“数据库任务表 + 单进程持久 worker/lease，BullMQ/Redis 后置”。
- 决策页已将 D71–D74 标记为已确认并默认进入 D75；浏览器验证 D75 三个选项、独立页降级提示和全项目页同步状态，两个页面根容器均为 `clientWidth=736`、`scrollWidth=736`，无横向溢出。
- D74 修正与 D75 同步后静态复核通过：正式 Markdown frontmatter/围栏、两个 fragment 的 JavaScript 语法和 `git diff --check` 正常；HTML tidy 仅报告既有 HTML5 兼容提示。
- 用户确认 D75 选择 A：`GenerationTask/TaskAttempt` 进入 SQLite，由同一 NestJS 进程用 claim、lease、heartbeat、启动扫描、有限重试和协作取消执行；内存只保留唤醒信号与当前 AbortController。
- D75 正式约束补充：执行为 at-least-once，每类任务必须有 `idempotencyKey/sourceDigest`、已有产物检查和重复回写保护；过期 lease 只有在安全时才重试，否则记录 `WORKER_INTERRUPTED/needsReview`。
- 图片候选、角色和场景参考图统一进入 `concurrencyKey=image-provider` 且 V1 并发为 1；不再由业务服务各自维护 Promise 队列。V1 不引入 Redis/BullMQ 或多进程 worker。
- 已同步系统架构、生成任务协议、模块职责、D7 提议和任务留痕；当前转入最后一项 D76，推荐保留原 taskId 并导入不可执行 `legacy_stub`，不根据现有文件伪造成功历史。
- D76 配套页浏览器复核通过：D71–D75 已确认标记、D76 三个选项、A 选择与 standalone 降级提示均正常；独立页默认 `clientWidth=736/scrollWidth=736`，窄屏为 `337/337`，全项目页为 `736/736`，两个页面控制台无 warning/error。
- 两个可视化 fragment JavaScript 语法与 `git diff --check` 通过；本轮仍未修改业务代码、Prisma schema、数据库或 workspace 业务数据。
- 用户确认 D76 选择 A：保留全部原 taskId；完整旧 artifact 按只读 `legacy_imported` 导入，缺失历史创建不可执行 `legacy_stub`，不把现有文件推断为任务成功。
- 已新增 `ADR-0012_全量数据库化切换与持久任务边界.md`，将 D71–D76 作为同一不可轻易回退的数据库、凭据、任务与迁移决策采纳。
- 已同步产品范围、任务队列 UI 语义、系统架构、核心数据模型、生成任务协议、素材契约、模块职责、AI 上下文、研究基线、会话和长期记忆。
- 最终决策页浏览器复核通过：独立页显示 D71–D76 六项确认和 ADR-0012，总页默认聚焦 D2 并可切换查看 D7 已采纳状态；两页默认 `736/736`、窄屏 `352/352`，无横向溢出，控制台无 warning/error。
- 最终静态复核通过：两个 fragment JavaScript 可解析，正式文档 frontmatter/代码围栏有效，HTML tidy 仅有既有 HTML5 属性兼容提示，`git diff --check` 通过。
- 功能完成记录不适用：本任务只完成规划、决策与文档收口，没有交付可运行功能；详细开发文档和真实迁移另立后续任务。

## Handoff

### 已完成

- 建立 D7 复杂任务记录与验收框架。
- 当前数据盘点、真实样例完整性审计、官方资料复核、目标边界和 M0–M6 迁移提议。
- 正式提议 Markdown 与配套决策页。
- D71–D76 用户决策、ADR-0012、契约同步、静态复核和决策页运行复核。

### 进行中

- 无；D7 规划任务已完成。

### 后续任务

- 逐字段 Prisma schema、migration、仓储接口和 M0–M6 详细开发文档。
- 使用备份副本执行影子导入、凭据迁移、任务故障注入和真实切换演练。
- 用户明确授权前不开始业务实现。
