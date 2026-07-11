---
doc_id: AIR-ADR-0013
status: active
created: 2026-07-11
updated: 2026-07-11
owner: AI漫游项目
audience: human, ai-agent, developer
source: 七阶段能力缺口、G1数据库模型、G2代码审计、用户于 2026-07-11 确认核心规则
---

# ADR-0013 上游版本链与派生 Freshness

## 1. 状态

已采纳，尚未实现。用户确认：存在未确认修改时保留旧成品查看，但禁止启动新的下游任务；确认新正式版本后，旧下游才显示“来源已更新”。

## 2. 背景

现有剧本、剧情结构、分镜和出图准备同时存在四种不一致行为：

1. 已完成剧本继续保存时只覆盖正文，不发布新的正式剧本版本。
2. 已确认剧情结构和分镜可被原地修改，版本 ID 不变。
3. 分镜修改会直接清空 preflight、候选和排版，并倒退章节状态。
4. 出图准备只用 storyboard ID 与时间戳判断来源，无法覆盖角色图、场景图和画风变化。

因此，`Chapter.status=exported` 既不能证明当前结构仍来自当前剧本，也不能说明旧导出是否应保留。

## 3. 决策

### 3.1 工作稿与正式版本分离

- 剧本使用 `Chapter.scriptWorking*` 作为 Working Copy；AI pending 采用后只更新 Working Copy。
- 剧情结构和分镜使用各自 `pending*VersionId` 指向可变 `pending_confirmation` 版本。
- 用户确认后，pending 版本转为不可变 confirmed 版本并切换 current 指针。
- 未确认 Working Copy 不进入新下游任务；旧正式链仍可查看。

### 3.2 正式版本不可原地修改

`ChapterScriptVersion`、confirmed `StoryVersion`、confirmed `StoryboardVersion` 和 `PreflightRevision` 一旦生效，正文、文档、来源、摘要和版本号不可更新。返修只能创建新版本。

### 3.3 Freshness 由来源关系派生

不保存可独立写入的 `stale=true` 真值。统一使用：

```text
current     current 指针指向的正式版本，且来源仍匹配当前上游
stale       current 指针仍指向旧正式版本，但其来源不再匹配当前上游
historical  非 current 的只读版本或已归档 pending
pending     当前 active pending 指针指向、尚未确认的工作稿
```

未知或损坏来源不新增第五种 freshness；使用 `stale + reasonCode=*_SOURCE_UNRESOLVED` 阻止新任务。

### 3.4 来源使用规范快照和摘要

每个正式下游保存上游实体 ID、`sourcePolicyVersion`、内容摘要和 `SourceSnapshot` 摘要。摘要使用 G1 已冻结的 RFC 8785 JCS + SHA-256；时间戳、文件路径、数据库顺序和展示文案不参与摘要。旧 policy 无法重建时必须阻止，不能用最新算法偷偷重算。

### 3.5 最远里程碑与当前可用性分离

`Chapter.milestoneStatus` 只表达该章曾达到的最远阶段，保持单调；workflow 另外投影 `freshness/attention/canStartTask/reasonCodes`。上游变更不会把 `exported` 粗暴改回 `script_done`。

### 3.6 旧产物不删除、不覆盖

新上游发布后，旧 Story、Storyboard、Preflight、Candidate、Layout、Export 和 Task 保留原来源。旧产物可查看、比较和下载，但不能作为新的正式下游输入。

### 3.7 创建与完成任务都校验来源

任务创建时固化 `sourceDigest` 和来源关系；完成时再次比较 current 指针、来源摘要、目标 pending 指针和 fencing token。来源变化时任务可以保留成功输出，但不得切换 current 或 active pending。

## 4. 被否决的备选

### 4.1 否决：继续原地更新版本

版本 ID 不变但内容变化，会让任务、候选、布局和导出无法证明真实输入。

### 4.2 否决：上游修改后清空所有下游

会丢失用户手工排版、历史导出和任务证据，也无法支持 A→布局→返修路径。

### 4.3 否决：通过回退 Chapter.status 表达失效

单一线性状态无法同时表达“曾经导出”和“当前结构需要更新”。

### 4.4 否决：把 freshness 存成可写布尔值

任何漏掉的批量更新都会形成第二事实源；派生关系比状态回写更可验证。

### 4.5 否决：只比较 updatedAt

时间相同不证明内容相同，时间变化也不一定代表生成语义变化；时间戳不能替代来源版本和摘要。

### 4.6 否决：有 Working Copy 时仍允许启动新下游任务

用户会得到基于旧正式版本的新结果，随后确认 Working Copy 又立即使其过期，造成不必要成本和理解混乱。

## 5. 影响范围

- G1 StoryVersion/StoryboardVersion 补 `rowVersion/origin/archivedAt` 等 G2 字段，不新增通用文档表。
- Script、Story、Storyboard、Preflight API 改为 Working Copy/确认语义和乐观锁。
- `ProjectWorkflowStep` 增加 `needs_confirmation/needs_update` 及来源投影字段。
- `story_parse/shot_generate/shot_prompt_generate/image_generate` 使用统一 SourceSnapshot 和 ApplicabilityGuard。
- Story 文档不再把场景参考图当语义字段；Storyboard 文档不再把候选锁定或生成状态当分镜语义字段。
- 旧文件导入需要重建摘要；证据不足的旧 preflight 默认要求重新确认。

## 6. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 用户不理解版本术语 | UI 使用“有未确认修改 / 来源已更新 / 历史版本”，不展示 digest |
| 过度失效导致重复生成 | 用字段级 codec 排除时间戳、资产展示字段和候选状态 |
| 漏失效导致旧结果污染 | current ID + digest 双校验，创建和完成两次 guard |
| 并发确认覆盖他人或旧页面 | expected current ID、working digest、rowVersion 和 sourceDigest 乐观锁 |
| 旧数据来源不足 | 保留历史并标记 unresolved reason；不猜测、不伪造 current |

## 7. 回滚边界

G2 一旦产生第二个正式版本和 stale 历史，不能回滚到“只保留一份并原地覆盖”的写模型，否则会丢失关系。可以临时隐藏历史 UI，但后端写入仍必须遵守不可变版本与来源 guard。

实施期若尚未发生 G2 业务写，可恢复迁移前协调备份；发生业务写后，只能回滚到兼容新版本链的应用版本或恢复整套 DB + Asset 备份。

## 8. 验证标准

- 已导出章节修改剧本 Working Copy 时，旧导出仍可查看，新结构任务被阻止。
- 发布新 ScriptVersion 后，旧 Story current 指针保留但 freshness 为 stale。
- 确认新 StoryVersion 后，旧 Story 变 historical，Storyboard 变 stale。
- 编辑 confirmed Story/Storyboard 不改变原行，必须产生 pending。
- 新 Storyboard 确认后不删除旧 Candidate/Layout/Export。
- Preflight 能分别识别 storyboard、角色生成输入、场景视觉和画风变化。
- 旧任务迟到不能更新 current 或 active pending。
- `Chapter.milestoneStatus` 不因返修倒退。

## 9. 关联文档

- `文档/04_方案与决策/2026-07-11_G2上游版本链与Freshness开发方案.md`
- `文档/04_方案与决策/2026-07-11_G2版本来源与Freshness契约字典.md`
- `文档/06_测试与验收/G2上游版本链与失效验收清单.md`
- `文档/04_方案与决策/ADR-0012_全量数据库化切换与持久任务边界.md`
- `文档/04_方案与决策/ADR-0010_候选定稿修订与下游返修.md`
