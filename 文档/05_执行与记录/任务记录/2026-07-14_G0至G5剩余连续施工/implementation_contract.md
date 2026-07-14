---
doc_id: AIR-G05-REMAIN-CONTRACT-001
status: active
created: 2026-07-14
updated: 2026-07-14
owner: AI漫游项目
audience: luna, developer, reviewer
source: G1/G2/G4/G5 accepted ADR 与施工契约
---

# G0～G5 剩余连续施工实施契约

## 1. 契约优先级

发生冲突时按以下顺序处理：

1. 用户当前明确授权和禁止项。
2. `AGENTS.md` 与项目事实源规则。
3. 已接受 ADR、Schema/API/状态机契约。
4. 本施工包的编排和文件地图。
5. 现有实现细节。

不得为了迁就旧实现而违反上位契约；若两个已接受事实源互相冲突，停止并列出冲突，不自行重写产品语义。

## 2. 必读事实源

### 共通

- `文档/README.md`
- `文档/00_索引/AI上下文入口.md`
- `文档/00_索引/写作规范与留痕规则.md`
- `文档/05_执行与记录/路线图与里程碑.md`
- `文档/06_测试与验收/七阶段完整链路验收基线.md`

### S0/R0B/R1/R2

- `文档/05_执行与记录/任务记录/2026-07-13_R0-R2真实切换施工包/*`
- `文档/04_方案与决策/2026-07-12_G3-M施工包_备份恢复与DB-only激活.md`
- `文档/06_测试与验收/G1数据库迁移执行与验收清单.md`

### W1/G2

- `文档/04_方案与决策/2026-07-11_G2上游版本链与Freshness开发方案.md`
- `文档/04_方案与决策/2026-07-11_G2版本来源与Freshness契约字典.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_API与幂等契约.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_文件Repository与事务地图.md`
- `文档/04_方案与决策/2026-07-12_G2施工包_依赖边界与阶段门禁.md`
- `文档/06_测试与验收/G2施工包_可执行测试与证据计划.md`

### G4

- `文档/04_方案与决策/ADR-0010_候选定稿修订与下游返修.md`
- `文档/04_方案与决策/2026-07-11_G4候选定稿修订与返修开发方案.md`
- `文档/04_方案与决策/2026-07-11_G4候选定稿与影响预览契约字典.md`
- `文档/06_测试与验收/G4候选定稿返修验收清单.md`

### G5

- `文档/04_方案与决策/ADR-0011_高自由成稿编辑器首版边界.md`
- `文档/04_方案与决策/2026-07-11_G5高自由成稿编辑器开发方案.md`
- `文档/04_方案与决策/2026-07-11_G5LayoutDocument与编辑命令契约字典.md`
- `文档/04_方案与决策/2026-07-11_G5确定性渲染与出版导出契约.md`
- `文档/06_测试与验收/G5成稿编辑器与确定性导出验收清单.md`

## 3. 全局不可变约束

### 3.1 数据与历史

- DB-only 激活后，DB 是 Project/Chapter/Version/Revision/Task/Asset 元数据的唯一事实源。
- Working Copy 可变；正式 Version/Revision/Publication 不可变。
- “返修”只新增 revision、source binding 和 current pointer；不物理覆盖/删除历史 Layout、Export、Artifact、Asset。
- freshness 是来源比较的派生结果，不新增一个可随意写入的 `stale` 开关。
- 来源证据不足时用 `unresolved + reason` 阻塞新正式输出，不猜测 current。
- migration/importer 必须可幂等重跑；同一 identity 不得制造重复正式行。

### 3.2 并发与幂等

- 所有 Working Copy 更新带 rowVersion/CAS；冲突返回稳定 409。
- 正式 confirm/commit 绑定 expected source/current revision/impact digest。
- 丢响应重试在 identity 相同且结果一致时返回 replay；不得创建第二条 revision。
- 真实并发、source drift、impact drift 不得当成 replay。
- Web 收到冲突后保留用户本地内容，刷新 server state 并要求显式重新确认。

### 3.3 任务与迟到结果

- Task input 绑定不可变 source snapshot/version/revision/digest。
- claim/lease/attempt/current applicability 必须在完成事务再次验证。
- 迟到、已取消或旧来源任务可以保留 historical 结果，但不能切 current pointer。
- Outbox/worker 重启应收敛，不依赖进程内唯一状态。

### 3.4 安全与路径

- 测试和原型默认只使用系统临时目录、临时 SQLite、loopback fake service。
- 默认用户 Keychain、真实 provider/OpenCode 凭据、真实 HOME 不得被测试触碰。
- secret 不得进入 argv、stdout/stderr、日志、DB/settings/migration report/task/artifact/export fixture。
- 仓库证据只记录相对路径、digest、计数和稳定枚举；真实绝对路径只在仓库外私有 plan。
- 清理临时目录前必须验证 marker、realpath 和允许根，禁止通配符删除未知路径。

### 3.5 UI 与用户语义

- 旧正式版本/成品始终可查看；新 pending 不隐藏历史。
- `dirty/pending/stale/historical/unresolved/conflict` 必须用明确中文，不只靠颜色或内部错误码。
- Server 是权限和门禁最终裁决者；按钮 disabled 不能代替服务端拒绝。
- 手机预览只读；AI 建议未经用户确认不得修改正式或 Working Copy 状态。

## 4. W1 模式边界

### 4.1 Adapter 规则

Web 可以保留 file/db 两个 adapter，但必须满足：

```text
capability.mode=file  -> 只调用 file API
capability.mode=g2_db -> 只调用 G2 DB API
DB API 失败           -> 展示错误，不 fallback file
```

禁止：

- 同一保存动作同时请求 file 与 DB。
- 先写 legacy JSON，再写 DB 补偿。
- 组件直接判断 persistence mode 并到处拼 URL；模式选择集中在 service/store seam。
- 使用 `updatedAt` 猜并发或 freshness。

### 4.2 Story DB 契约

```text
GET    /story-structure/working-copy
POST   /story-structure/working-copy
PATCH  /story-structure/working-copy
DELETE /story-structure/working-copy
POST   /story-structure/working-copy/confirm
```

- confirm 只能消费 active Working Copy。
- dirty/pending 期间旧 current Story 不被改写。
- publish 后下游 current/stale 由服务端来源链派生。

### 4.3 Storyboard DB 契约

```text
GET    /storyboard/working-copy
POST   /storyboard/working-copy
PATCH  /storyboard/working-copy
DELETE /storyboard/working-copy
POST   /storyboard/working-copy/confirm
POST   /storyboard/working-copy/shots
```

- Shot 稳定 ID、排序和来源由正式 contract 处理。
- confirm 不改写旧 StoryboardVersion；source Story 变化产生新版本链/显式 stale。

### 4.4 Preflight DB 契约

```text
GET  /image-preflight/preview
POST /image-preflight/confirm
```

- preview 是对当前 DB source 的 live projection，不是一个可写 Working Copy。
- confirm 必须绑定 `expectedSourceDigest`、current Storyboard/Preflight 与 rowVersion 契约。
- Controller 中相同 POST 路由只能定义一次；模式分派必须显式、可测试。

## 5. 真实切换契约

- R0B 只允许读取 source 和写隔离 shadow/backup/restore 目标，不允许停写或生成 AUTH。
- C0 是无 AUTH 的只读门；C0 未通过不能创建 AUTH-C1。
- AUTH 文件不可覆盖、绑定 plan/run/release/appCommit 和前序 evidence digest。
- C1～C4 只接受 AUTH-C1；C5～C6 只接受 AUTH-C5；C7 只接受 AUTH-C7。
- AUTH-C7 不自动授权 R2；C7 成功后必须取得独立 R2 观察授权。
- SH-10、AUTH-C1/C5/C7 必须由人类完成，Luna/Codex 不能自签或角色扮演。
- C7 后必须完成 R2 观察期；观察期前不删除 backup/archive，不宣布 G1 完成。

## 6. G4 契约

### 6.1 Candidate 状态分离

```text
favorite != final lock
rejected/restored != final lock
Candidate.status selected/locked != runtime authority
current final = Shot.currentCandidateLockRevision pointer
```

- 当前定稿不能直接废弃。
- 已废弃、source historical/unresolved、Asset 非 ready 的 Candidate 不能定稿。
- 新 Candidate 不自动更换定稿。

### 6.2 两阶段变更

```text
preview(expectedRevision, targetCandidate/action)
  -> impact set + impactDigest + policy
commit(expectedRevision, impactDigest, idempotency identity)
  -> created | replayed | no_op | 409
```

- preview 和 commit 必须调用同一个规范化 resolver。
- 影响集变化返回 `IMPACT_CHANGED`，Web 重新 preview 但不得自动 commit。
- A→B→clear→A 产生四条线性不可变 revision，不复用旧 A revision。
- replace/clear 不修改旧 Layout/Export/Asset；只令相关新工作派生 stale/unresolved。

### 6.3 G4/G5 边界

- G4 只提供 lock revision、影响、freshness、门禁和 stale 摘要。
- G4 不在画布中替换图片、选择 crop 或新建修复后的 LayoutRevision。
- G5 才解决 Layout Working Copy 的 source replacement。

## 7. G5 契约

### 7.1 LayoutDocument

- LayoutDocument 是唯一可持久化编辑语义；画布库 JSON、DOM、viewport、selection、control handle 不属于文档。
- codec 严格拒绝 unknown field/超限/非法数值；规范化和 digest 有 known-answer。
- 页漫和条漫共用对象、命令、来源与 renderer 语义；只由 profile 决定版式差异。

### 7.2 编辑与保存

- 用户动作通过 command reducer；batch 原子，Undo/Redo 有明确 inverse 或快照策略。
- IME composition 中间态不写入命令历史；一次 Undo 恢复输入前状态。
- autosave 只更新 Working Copy；显式保存才创建 immutable LayoutRevision。
- 导出永远读取 LayoutRevision，不读取未保存 Working Copy。

### 7.3 来源返修

- 画格绑定 G4 CandidateLockRevision，而不是 Candidate 当前状态或旧 `lockedCandidateId`。
- source replacement 使用 preview+digest+commit；`preserve/reset/manual crop` 由用户显式选择。
- source 再变化使旧 replacement preview 失效；不得静默使用旧 digest。

### 7.4 Renderer 与出版

- 正式 renderer 只消费规范化 LayoutRevision、受控 FontAsset 和 Asset manifest。
- 不截图带编辑控件的页面，不访问外网或任意 `file://`。
- 固定输入、字体、renderer 版本连续三次产物 sha 相同。
- 一个 `layout_publication` 绑定同一 LayoutRevision 并包含 PNG/PDF/slices 等多个 Artifact；格式间不争抢 current。
- 输出必须可解码并验证尺寸、页数、字体/embedding、slice 拼接和 sha。

### 7.5 E0 技术门

- 至少两条候选完整薄切片。
- 只有所有 G5-E0-001～010 硬门通过才可进入 M2。
- 失败原型可以删除，不得把原型私有数据结构迁入正式 Schema。

## 8. Git 与证据契约

- 每阶段开始记录 baseline SHA；每阶段结束记录 commit SHA。
- 只按阶段 manifest 暂存文件；禁止 `git add -A`、`git reset --hard`、覆盖未知变更。
- commit 前至少运行阶段定向测试、受影响 package typecheck/build。
- 阶段最终 Review 使用已提交或待提交的同一 diff；Review 后改代码必须重新审查受影响部分。
- 大型二进制证据默认留在受控临时 workspace；仓库只记录 sha/bytes/dimensions/pages/reproduce command，不提交含隐私的大产物。

## 9. 不在本任务范围

- G6 素材 ZIP、下载包、渠道包。
- 视频、TTS、字幕、时间轴、MP4。
- 多人实时协作、通用白板、绘画/滤镜/inpaint。
- 新真实 provider 采购或真实凭据配置。
- down migration、删除 metadata archive/backup、清理历史正式产物。
