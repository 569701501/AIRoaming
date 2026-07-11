---
doc_id: AIR-TASK-20260710-D7-DATABASE-PLAN
status: completed
created: 2026-07-10
updated: 2026-07-10
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户已选择 D7-B 立即全量数据库化，并要求继续逐项规划
---

# 任务计划：D7 全量数据库化规划

## 1. 目标

在不进入功能开发的前提下，盘点 AI漫游当前 Prisma、进程内 Map/队列、本地 workspace JSON/Markdown、素材文件、设置和对话运行态，定义“全量数据库化”的准确边界、目标事实源、迁移批次、切换方式、回滚策略、旧数据处置和验收标准，并一次只向用户提出一个高影响决策。

## 2. 非目标

- 不修改 Prisma schema、业务代码、数据库文件或 workspace 业务数据。
- 不把图片、视频、PDF、ZIP 等二进制素材直接塞入 SQLite。
- 不在数据盘点完成前锁定迁移顺序或删除旧 JSON/Markdown。
- 不把 API Key、访问令牌等秘密明文迁入普通业务表。
- 不以“双写一直保留”代替明确的切换与退出条件。

## 3. 验收标准

1. 每类当前数据都能回答：现存位置、读写入口、恢复方式、权威来源、目标归属和迁移风险。
2. 明确数据库、素材文件、密钥存储和可重建缓存之间的边界，避免把“全量数据库化”误解为“所有字节都进数据库”。
3. D1、D3、D4/D5 所需事务、外键、不可变修订、来源 digest 和历史查询均被目标模型覆盖。
4. 给出可执行的数据盘点、导入、校验、切换、兼容窗口、回滚、清理和验收阶段。
5. 明确重复导入、部分失败、孤儿引用、文件缺失、任务重启和旧版本数据的处理规则。
6. 只提出一个依赖最高的 D7 决策，并给出推荐答案与代价。

## 4. 当前阶段

阶段 4 已完成：D71–D76 全部确认，方案状态为 accepted，并由 ADR-0012 采纳；未进入功能开发。

## 5. 阶段

### 阶段 1：事实源与代码盘点

- [x] 读取项目入口、写作规则、长期记忆和 D1/D3/D4/D5 决策。
- [x] 核对 Prisma schema、迁移历史和数据库实际使用入口。
- [x] 枚举进程内 Map、队列、pending 状态和服务重启行为。
- [x] 枚举 workspace 中项目、章节、对话、任务、设置和素材文件。
- **状态：** completed

### 阶段 2：目标事实源与数据分层

- [x] 定义关系数据库内的权威业务实体、修订、任务和索引。
- [x] 定义仍留在文件系统的二进制素材与派生导出物。
- [x] 定义密钥、临时缓存和可重建索引的存储边界。
- [x] 对齐 D1、D3、D4/D5 契约。
- **状态：** completed

### 阶段 3：迁移、切换与回滚方案

- [x] 比较停写一次切换、短期双写和长期双向同步三类策略。
- [x] 设计幂等导入、校验报告、切换闸门、失败回滚和旧文件封存。
- [x] 设计任务运行态、素材引用和删除项目的迁移边界。
- **状态：** completed

### 阶段 4：提议、复核与讨论入口

- [x] 形成 D7 正式提议与配套决策材料。
- [x] Scrutiny Review：事实、契约、风险、阶段和证据一致性。
- [x] Runtime/User Review：本轮无迁移运行；已整理未来演练与验收清单。
- [x] 记录 D71 选择 A，并将 DB-only、旧元数据只读封存和回滚窗口写入契约。
- [x] 记录 D72 选择 A，并将本地 SQLite 单引擎、受控本地路径、PostgreSQL 迁移触发条件和首版不做双引擎写入契约。
- [x] 记录 D73 选择 A，并将关系核心、版本化 Json、同事务投影和禁止独立写投影写入契约。
- [x] 记录 D74 修正版 A：文本 key 归 OpenCode 本地 auth，图片 key 归后端 SecretStore，数据库只留非秘密 metadata。
- [x] 记录 D75 选择 A，并将 SQLite 任务事实源、不可变 attempt、lease/heartbeat、重启恢复、协作取消、幂等和图片并发 1 写入契约。
- [x] 记录 D76 选择 A：保留原 taskId；完整旧记录只读导入，缺失历史创建不可执行 legacy stub，不伪造状态。
- [x] 新增 ADR-0012，并完成最终 Scrutiny Review、决策页 Runtime Review 与 Handoff。
- **状态：** completed

## 6. 已知约束

| 约束 | 来源 |
| --- | --- |
| 用户已选择 D7-B：立即全量数据库化 | 用户决策 |
| 当前主业务仍以进程内索引 + workspace 文件为主 | 代码与长期记忆 |
| MVP 技术倾向为 SQLite，后续可切 PostgreSQL | AI 上下文入口 |
| D1 漫画版式创建时必选且不可直接修改 | ADR-0009 |
| D3 要求不可变定稿修订、事务切换、历史查询与 stale 派生 | ADR-0010 |
| D4/D5 要求 Layout Working Copy、LayoutRevision、富文本、预检与确定性渲染 | ADR-0011 |
| 当前 Prisma 6.19.3 只有 6 个未接线模型，没有 migration、数据库文件或业务 CRUD | 代码核验 |
| 当前样例 67 个 Asset 文件引用完整，但 55 个唯一 taskId 中 54 个缺完整 artifact | 只读 workspace 审计 |
| SettingsService 当前会把四类 API Key 明文写入 gitignored JSON；D74 目标必须拆分凭据所有权 | 代码核验 |
| OpenCode 本地 auth.json 可作为文本 key 权威存储；图片 key 必须由后端 SecretStore 安全保存 | 用户 D74 澄清与确认 |
| TasksService、图片候选和角色/场景参考图仍依赖 Map/Promise 队列，无 lease、heartbeat、自动重试或重启恢复 | 代码核验 |
| 用户已确认 D75=A：SQLite 任务表 + 单进程持久 worker/lease；V1 不引入 BullMQ/Redis | 用户决策 |
| 用户已确认 D76=A：保留原 taskId；legacy_imported/legacy_stub 只读且不可执行，不伪造成功历史 | 用户决策 |
| 本轮只研究、讨论和写方案，不开发 | 用户总体要求 |

## 7. 待逐项决策树

1. **已确认 D71=A：** 影子导入 + 短暂停写一次 DB-only 切换；旧元数据只读封存，不做运行期双写。
2. **已确认 D72=A：** 首版本地 SQLite 单引擎；保持 PostgreSQL 可迁移，但不建设双引擎。
3. **已确认 D73=A：** 关系核心 + 版本化 Json + 可重建投影；投影不是第二写源。
4. **已确认 D74=修正版 A：** 文本 key 归 OpenCode；图片 key 归后端 SecretStore；数据库不保存明文。
5. **已确认 D75=A：** SQLite `GenerationTask/TaskAttempt` + 单进程持久 worker/lease；图片任务统一并发 1，BullMQ/Redis 后置。
6. **已确认 D76=A：** 保留全部原 taskId；完整旧证据导入为 `legacy_imported`，缺失历史导入为 `legacy_stub`，均不进入队列。

## 8. 角色边界

- Orchestrator：维护事实源、任务阶段、决策顺序和阻塞。
- Worker：只做当前数据盘点、代码核验、方案整理和文档。
- Scrutiny Review：只读复核存储边界、迁移安全、回滚与契约一致性。
- Runtime/User Review：本轮不执行真实迁移；未来由用户在备份副本和真实项目样例上验收。

## 9. 退出标准

- 当前存储面与目标存储面完整映射。
- 迁移、切换、回滚、清理和验收阶段可独立执行并有退出闸门。
- D71–D76 全部形成明确、互不冲突的正式决策并由 ADR 采纳。
- 未修改业务代码、Prisma schema、数据库或 workspace 业务数据。
