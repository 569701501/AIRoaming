---
doc_id: AIR-TASK-20260710-D7-DATABASE-FINDINGS
status: completed
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 研究发现：D7 全量数据库化规划

## 1. 初始判断

- “全量数据库化”应解释为：所有权威业务事实、关系、状态、修订、任务和可查询元数据进入数据库；二进制素材与大型导出物继续由受控文件存储承载，数据库保存稳定资产记录、相对存储键、摘要、大小和来源。
- 当前系统存在数据库 schema、进程内状态和 workspace 文件三套层次；迁移风险不只在导入数据，还在切换后是否仍有旧写入口继续制造分叉事实。
- D1、D3、D4/D5 使迁移成为后续开发底座：需要数据库事务、唯一约束、外键、不可变修订、来源 digest、历史查询和任务恢复。

## 2. 代码核验结论

- Prisma 当前只有 Project、StoryVersion、Shot、Candidate、Asset、GenerationTask 六个模型；无 migration、数据库文件、PrismaService 或真实 CRUD。
- 项目/章节/角色/结构/分镜/候选/布局/导出由 `ProjectRepository` 的 Map 与 workspace JSON/Markdown 读写承担。
- GenerationTask、对话线程、消息、工具结果、多类 pending 预览和图片串行队列依赖进程内 Map/Set/Promise。
- 非秘密设置可进入数据库；API Key 不能进入普通业务表，应进入 Keychain 或专用加密存储。

## 2.1 真实样例证据

- 当前 1 个项目、2 个章节、82 个文件、约 54 MB，其中 64 个 WebP、14 个 JSON、4 个 Markdown。
- 67 个 Asset 均有物理文件；12 个角色的 Asset 引用有效；27 个 Candidate 均能找到 15 个正式 Shot 和对应 Asset。
- Candidate/Asset 共引用 55 个唯一 taskId，只有 1 个存在 input/output artifact；其余 54 个不能恢复完整任务历史。
- 旧任务迁移只能保存能证明的字段，不可伪造输入、耗时、错误或成功状态。D76 已确认用 `runtime/legacy_imported/legacy_stub` 与独立 `provenanceStatus` 分层；legacy 禁止执行或重试。

## 2.2 官方资料结论

- Prisma Migrate 的 migration history 是部署事实源，必须提交整个 migrations 目录，不能只保留 schema。
- Prisma 6.2+ 支持 SQLite Json/Enum，但高级 Json 过滤有限，适合版本化文档，不适合代替所有关系索引。
- SQLite 在 Prisma 中只支持 Serializable 隔离；interactive transaction 不应包含 provider 网络调用或慢文件操作。
- SQLite 与 PostgreSQL migration SQL 不兼容，未来切库需要新的基线和数据迁移。
- Prisma 不提供可依赖的自动数据 down migration；正式回滚应依靠 expand-and-contract、兼容代码和备份。
- SQLite WAL 允许读写并行但仍只有一个 writer，且不能放网络文件系统；启用前需验证实际运行时版本和备份/checkpoint。
- Apple Keychain、Windows Credential Locker 与 Linux Secret Service 都提供系统级小型秘密存储；图片 key 可通过后端 `ImageCredentialStore` 封装平台差异。
- OpenCode 官方文档确认 provider credential 默认进入 `~/.local/share/opencode/auth.json`；用户确认该文件可作为文本模型 key 的权威存储，AI漫游不应再重复持久化同一文本 key。
- `atom/node-keytar` 已归档，方案不能把跨平台凭据能力等同于直接引入该库。
- BullMQ 建立在 Redis 上并支持多 worker、stalled recovery 与并发，但最坏情况仍是 at-least-once；任何方案都必须先设计幂等任务与重复回写保护。

## 2.3 密钥代码与环境证据

- `SettingsService` 的四类 provider 设置都直接包含 `apiKey`，并通过 `writeFile()` 序列化到 `app-settings.json`；`.gitignore` 不是静态加密。
- 设置响应已经隐藏完整 key，但仍返回首尾 preview；目标只需要 configured/source/fingerprint/updatedAt。
- 本次仓库 workspace 只有 `workspace/settings/.gitkeep`，没有实际 `app-settings.json`；正式迁移前仍需扫描真实运行目录。
- 用户全局 OpenCode `auth.json` 文件存在且权限为 `0600`；内容未读取，不能自动归入 AI漫游，也不能整体清理。

## 3. 风险假设

- 直接切换而没有导入校验与只读封存，容易出现“数据库新事实 + JSON 旧事实”双主源。
- 长期双写会把一次迁移变成永久复杂度；如果需要双写，只能是短期影子校验并有明确退出条件。
- 正在运行的任务若未冻结或重排，可能在切换点后把旧来源结果写回新事实源。
- 文件存在不等于数据完整；迁移必须同时检查数据库引用、资产记录、物理文件和内容摘要。
- 不能把文本模型与图片模型 key 当作同一类凭据：文本由 OpenCode 调用，图片由 NestJS 直接调用，权威存储应跟随调用运行时。
- D71 的旧元数据只读封存不能原样包含旧 settings 图片 key；图片秘密必须先迁入 SecretStore 并验证，再脱敏封存。
- 任务只写数据库但仍靠当前 Promise/void 触发，不具备重启恢复；数据库必须参与 claim、lease 和恢复，而不只是任务列表持久化。

## 4. 推荐结论

- 正式业务数据使用数据库唯一写源；旧 JSON/Markdown 只做导入、导出和只读历史快照。
- 大文件继续放 workspace，但每个文件必须有 Asset、稳定 storageKey、sha256、bytes、来源和状态。
- 切换采用影子导入演练、短暂停写、最终导入校验、DB-only 开放写入；不做长期双写。
- D71 已确认 A：影子导入 + 短暂停写一次 DB-only 切换；旧元数据只读封存，不做运行期双写或双向同步。
- D72 已确认 A：本地 SQLite 单引擎，数据库文件位于应用受控本地目录；保持 PostgreSQL 可迁移，但首版不建设双引擎。
- D73 已确认 A：关系核心 + 版本化 Json + 可重建投影；正式保存时文档、投影和 current 指针同事务提交。
- D74 已确认修正版 A：文本 key 归 OpenCode 本地 auth；图片 key 归后端 SecretStore；SQLite/workspace 只保存非秘密配置与引用。
- D75 已确认 A：SQLite `GenerationTask/TaskAttempt` + 单进程持久 worker/lease；at-least-once、幂等、启动恢复、协作取消和图片并发 1 为首版强制边界，BullMQ/Redis 后置。
- D76 已确认 A：保留原 taskId，完整 artifact 只读导入，其余创建不可执行 legacy stub；来源完整度与可执行生命周期分开，不把文件存在推断为 `succeeded`。

## 5. Scrutiny / Runtime 材料复核

- 最终 Scrutiny Review 通过：D71–D76 已与事实源、回滚边界、数据库部署形态、目标数据、密钥边界、任务协议和旧历史迁移对齐；ADR-0012 已形成，但不授权开发。
- 本轮未执行真实数据库迁移，业务 Runtime Review 不适用。
- 配套决策页已验证目标边界、迁移阶段、D71 选项、独立页降级提示与 736px 无横向溢出；全项目决策页已同步 D7 状态。
- 最终决策页已显示 D71–D76 全部确认和 ADR-0012；独立页与总页通过浏览器复核，默认和窄屏无横向溢出，控制台无 warning/error。
