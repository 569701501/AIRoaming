---
doc_id: AIR-G05-REMAIN-PLAN-001
status: active
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: luna, developer, qa, release-owner
source: G0～G5 路线图、R0-R2 runbook、G2/G4/G5 正式验收文档
---

# G0～G5 剩余连续施工总计划

## 1. 总目标

在保留当前已完成工程成果和历史数据的前提下，先关闭 DB-only 切换前的本地工程缺口，再通过受控真实切换进入 DB-only，随后完成 G4 候选返修与 G5 成稿出版。

## 2. 计划原则

1. **纵向切片。** 每个切片包含契约、实现、测试、证据、Review 和提交，不允许“先写所有 Schema，再写所有页面”。
2. **事实源单一。** DB 模式只认 DB version/revision/current pointer；不得继续双写 workspace JSON。
3. **历史不可变。** 上游返修新增 revision/current pointer，不改写旧 Layout/Export/Asset。
4. **真实与隔离分开。** 临时根测试通过不等于真实切换通过；两种证据使用不同状态。
5. **无排期、最少人工打断。** 不设置工期、预计天数或等待日期；前置满足即执行，自动区间内连续推进，只在固定授权门和真实 blocker 停止。
6. **先红灯后实现。** 新缺口先有失败用例或可复现证据，再修改代码。
7. **提交即阶段边界。** 每个提交都必须可构建、可测试、可回退，不夹带未知工作树变更。

## 3. 总阶段表

| 阶段 | 目的 | 当前状态 | 自动执行 | 退出状态 |
| --- | --- | --- | --- | --- |
| S0 | R0-A/默认门禁/未提交工作树收口 | `completed` | 已完成 | `S0_PASSED` |
| W1 | G2 第 2～4 步 DB-only Web + E2E | `completed` | 已完成 | `W1_PASSED` |
| R0B | 真实源只读发现和 release shadow | `completed` | 已完成 | `R0B_PREPARED` |
| R1 | C0～C7 真实切换 | `completed` | 已完成 | `DB_ONLY_ACTIVATED` |
| R2 | OBS-01～10 观察期 | `completed` | 已完成并通过双 Review | `DB_ONLY_OBSERVATION_PASSED` |
| G4 | CandidateLock 正式返修闭环 | `completed` | 已完成 | `G4_PASSED` |
| G5 | 高自由编辑器与确定性出版 | `in_progress_m3` | 连续执行 | `WAIT_G5_USER_ACCEPTANCE` |

当前唯一入口为 `luna_current_handoff.md`。v5 `completedThrough=C7`、evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`；以下 S0～R1-C7 activation 内容是已完成施工基线，不得重复执行。

## 4. S0：R0-A 与默认工程门禁收口（已完成基线）

### S0-1 工作树归属审计

任务：

- 记录 branch、HEAD、status、diff stat 和 untracked 列表。
- 按 `file_map.md` 将文件分为 `R0-A in-scope`、`S0 test gate`、`unrelated/unknown`。
- 对 R0-A 独立 Review 之后发生过变化的文件重新做 diff 复核。
- 未知改动不得暂存、删除或格式化；若与 in-scope 同行冲突，停止该文件并报告。

退出：存在可审计的阶段文件清单；用户改动为 0 丢失。

### S0-2 R0-A 成果复核

任务：

- 对照 R0-R2 `handoff/implementation_contract/evidence_and_test_matrix` 复核生产 SecretStore、证据 seal、runner、resume、rollback、临时 Keychain smoke。
- 重跑所有因工作树变化而失效的定向测试。
- 确认真实数据、默认 Keychain、真实凭据操作次数仍为 0。
- 同步文档中遗留的 `changes_requested` 或旧测试数量；不改写历史 Review 原文，只更新当前入口/进度。

退出：R0-A 仍满足 `ready_for_real_cutover_authorization_review / real_cutover_no_go`。

### S0-3 默认 `pnpm test` 稳定性

步骤：

1. 原样运行一次根 `pnpm test`，记录失败测试名和耗时。
2. 对失败项单独运行，区分真实死锁、共享资源竞争、fixture 启停开销和单纯 5 秒阈值。
3. 优先修复 fixture/资源清理/并行冲突；确需 timeout 时使用最窄作用域，并以实测耗时和上限说明理由。
4. 不修改业务预期、不 `skip/todo`、不只在交付命令后追加临时 CLI 参数。
5. 根 `pnpm test` 连续三次退出 0。

退出：默认命令本身可靠；失败时仍能在合理时间暴露问题。

### S0-4 全量门禁与提交

最低门禁见 `test_matrix.md`。建议提交拆分：

```text
fix(cutover): close isolated production entry
fix(test): make default workspace test gate reliable
docs(cutover): record stable R0-A handoff
```

若代码与文档能保持一个原子提交，可合并代码/对应证据；不得为了追求提交数量拆开不能独立通过的内容。

退出：clean/已知 dirty 工作树、提交 SHA、Scrutiny=`passed`、Runtime=`passed_isolated`。

## 5. W1：G2 DB-only Web 与浏览器门禁（已完成基线）

### W1-A 先锁 API/错误契约

任务：

- 逐项对照 `2026-07-12_G2施工包_API与幂等契约.md` 和 Shared DTO，列出 Story、Storyboard、Preflight DB 请求/响应。
- 为 Web client 增加显式 DB 方法；legacy 方法保留给 file adapter，但名称不得模糊。
- 禁止一个方法在 409 后自动改调 legacy。
- 新增 API contract/unit 测试：method、URL、body、unknown field、错误 envelope。

退出：Web 不再需要自己拼 expected digest/rowVersion；所有字段来自 Shared 契约。

### W1-B 合并 Preflight 重复路由

任务：

- `projects.controller.ts` 中相同 `POST :projectId/chapters/:chapterId/image-preflight/confirm` 只能保留一个装饰器。
- file 与 DB 模式使用明确的 command adapter/facade 分派；Controller 不捕获 DB 错误后 fallback。
- DB 模式严格接收 G2 `ConfirmChapterPreflightRequest`，file 模式保持现有用户路径；两者都必须有模式级集成测试。
- `GET image-preflight/preview` 是 DB live preview，不能读取/返回旧 `preflight.json` 冒充 revision。

退出：路由扫描只命中一个 confirm decorator；DB/file contract tests 均通过。

### W1-C Store 适配 Story

任务：

- DB 模式加载 current Story + active Working Copy + chapter production state。
- 编辑先创建/恢复 Working Copy；保存带 CAS rowVersion；discard 只丢 pending；confirm 创建 immutable StoryVersion/current pointer。
- dirty/pending 不使旧正式 Story 立即 stale，但阻止新的下游正式工作。
- 409 保留用户编辑内容，刷新 server state，展示重新确认动作；不得 last-write-wins。
- file 模式继续走原 API，不新增双写。

退出：创建、更新、discard、confirm、replay、conflict、reload 通过。

### W1-D Store 适配 Storyboard

任务：

- DB 模式使用 Storyboard Working Copy CRUD/confirm 和 `working-copy/shots`。
- Shot ID 由正式稳定规则/服务端返回，不由组件临时生成不稳定 ID。
- confirm 绑定 expected source/current Story、Working Copy rowVersion 和 chapter rowVersion。
- 上游 Story 新 current 后旧 Board 保留为历史并派生 stale。
- 双页签冲突不覆盖，丢响应重试只 replay 一次。

退出：Working Copy/Shot/confirm/history/stale/冲突通过。

### W1-E Store 适配 Preflight

任务：

- DB 模式先读取 live preview，再用 expectedSourceDigest/current Storyboard/current Preflight/chapter rowVersion confirm。
- Storyboard 变化后旧 PreflightRevision 保留，预览明确 stale reason。
- 角色/场景解除 blocker 后重新取 preview，不在前端修改 server-derived 检查结果。
- confirm replay 不重复创建 revision；真正 source drift 明确失败。

退出：ready、blocker、confirm、replay、source changed、restart readback 通过。

### W1-F 页面与状态语言

任务：

- 三个 workspace 共用一致的 `saving/saved/dirty/conflict/stale/historical` 表达。
- 页面按钮权限来自 production state/capability，不从旧 JSON 字段猜测。
- 历史/current 只读可查看；旧产物不因新 Working Copy 消失。
- 冲突提示给出“刷新状态/复制自己的内容/重新确认”，不自动刷新掉本地草稿。
- 不以 toast 代替页面内可恢复状态。

退出：组件测试与键盘/焦点基本可用性通过。

### W1-G DB-mode E2E Harness

任务：

- 扩展 `tests/e2e/support`，每次在系统临时目录创建唯一 workspace/data/SQLite。
- fresh deploy 正式 Prisma migrations，显式 `AIROAMING_PERSISTENCE_MODE=db`；不得复用开发数据库。
- 保留 file-mode 项目；DB-mode 使用独立 Playwright project/fixture，报告能区分模式。
- fake provider 只监听 loopback；默认用户 HOME/Keychain/真实 key/外网为 0。
- 支持 restart 同一临时 DB，结束时 marker + realpath 安全清理。

退出：测试报告能证明 server 确实运行在 `g2_db`，不是仅 mock capability。

### W1-H 必须通过的六条用户路径

1. Story dirty 未确认：旧 current 仍可看，新 Storyboard 被 gate。
2. Story 新 current：旧 Storyboard/Preflight 保留但 stale；重新确认后恢复 current chain。
3. 两标签编辑同一 Working Copy：一方成功，另一方明确冲突，本地内容不丢。
4. 历史复制到 Working Copy：不改历史，确认后新增 revision。
5. Story→Storyboard→Preflight 顺序点击：DB 模式实际成功，刷新/重启后状态一致。
6. file-mode 回归：现有项目库/阶段导航/保存确认路径仍通过，且没有 DB 双写。

执行 `--repeat-each=3`，任何偶发失败按缺陷处理，不写 flaky-pass。

### W1-I Review 与提交

建议提交：

```text
feat(web): connect g2 database working copies
fix(server): expose one preflight confirm route
test(e2e): cover db-only version chain
docs(g2): close db-only web cutover gate
```

退出：W1 全绿、Review 通过、工作树归属清楚，进入 `WAIT_R0B_AUTH`。

## 6. R0B：真实切换准备（已完成基线）

### 前置条件

- S0/W1 已提交；真实运行的 app commit 固定且工作树干净。
- 用户给出 `authorization_gates.md` 的 R0B 固定授权句。
- 私有 run root 位于仓库外，权限 0700；plan/authorization/evidence 文件 0600。

### R0B-1 只读发现

- 记录 release/appCommit/effective manifest、Node/pnpm/Prisma 版本。
- 确认 source workspace/data/settings 起点、空间、loopback maintenance 地址、责任人。
- 只保存 digest/枚举/计数到仓库；绝对路径和 credential 标识只进私有 plan。
- 不停写、不生成 AUTH、不执行 C1～C7。

### R0B-2 两个 fresh shadow

- 对同一只读 source snapshot，在两个空白隔离目标执行 full shadow。
- 对比 reportDigest、16 slices、entity counts、pointers、Asset sha、secret sentinel。
- blocker 必须为 0；warning 逐条有 disposition。
- 完成 backup/restore rehearsal，但不得覆盖真实 source/target。

### R0B-3 SH-10

- Luna 只整理脱敏 MigrationReport、差异和问题，不签字。
- 人类 Migration reviewer 亲自完成 SH-10。
- SH-10 缺失时停止；不得进入 C0。

退出：`R0B_PREPARED`，release plan sealed，可执行无授权只读 C0。

## 7. R1：真实 C0～C7（C7 activation 已完成）

本阶段命令和证据格式完全遵循 `R0-R2真实切换施工包/real_cutover_runbook.md`，本计划只定义编排。

### R1-1 C0

- 当前状态：v5 `passed_read_only`，不得重跑。
- 无 AUTH 执行只读 C0；验证 plan/root/release/capability/shadow/SH-10。
- 失败不生成 AUTH，修复后同一 identity 重跑。
- 通过后停止在 `WAIT_AUTH_C1`。

### R1-2 C1～C4

- 当前状态：v5 `passed`，最终 evidence=`sha256:69d08d7b8a28343907fa939d4f6040d7807247eb46f9a2c39512c806f6328642`，不得重跑。
- AUTH-C1 有效后依次 maintenance drain/close/bundle、final snapshot、fresh DB/credential prestage、final/ready/backup/materialize。
- 每一步单独 seal evidence，支持同 identity resume。
- 任何失败按 runbook rollback/cleanup；旧进程保持 closed 或由 rollback owner 授权 reopen。
- C4 通过后历史上曾停止在 `WAIT_AUTH_C5`；AUTH-C5 已消费，当前不再停留此处。

### R1-3 C5～C6（已完成）

- 当前状态：`passed_real`；AUTH-C5 已消费，C5/C6 均已通过。
- C5 已完成 closed DB server、DB smoke 和 ephemeral business write rollback；C6 已完成 metadata archive。
- file guard、C6_READY、backup/restore、firstBusinessWriteAt 首写边界断言已记录。
- C5/C6 完成后历史上停止在 `WAIT_AUTH_C7`；AUTH-C7 已消费，首写边界与 R2 均已完成。

### R1-4 C7（已完成 activation）

- 当前状态：C7 activation/COMPLETED、首笔业务写和 file guard 复核均已通过。
- AUTH-C7 后执行 activation；不接受口头替代文件、不接受旧 evidence digest。
- reopen/resume 必须幂等；首笔业务写入后 file mode 永久拒绝。
- C7 activation、首笔受控 DB-only 业务写与 file guard 复核均已完成；R2 也已通过，不得重复授权或观察。

## 8. R2：DB-only 观察期

当前状态：`DB_ONLY_OBSERVATION_PASSED`。OBS-01～10、Scrutiny 与 Runtime/User Review 均通过；AUTH-C7 与 R2 授权边界已按原规则分别消费，不设置日历排期。

逐项执行 G1 验收清单 `OBS-01～10`：

- DB-only 启停/重启、读写、任务恢复、SecretStore/provider 加载。
- Story/Storyboard/Preflight W1 六条路径在真实 release 的非破坏性检查。
- backup verify、restore rehearsal、日志/DB/settings/report/export 的 SEC-10 sentinel。
- 延迟任务、Outbox、失败恢复、旧 file guard、首写边界。
- 观察窗口内不删 metadata archive/backup，不做 down migration。

退出：已完成。四项真实缺口分别由 `62da892`、`0be5621`、`7ddeb21`、`a90f546` 关闭，状态为 `DB_ONLY_OBSERVATION_PASSED`；当前进入 G4-A。

## 9. G4：候选定稿修订与返修

### G4-A Shared + Schema overlay

状态：`completed`，commit=`79dc806`，Scrutiny=`passed`，Runtime=`passed_isolated`。

- 补 DTO/枚举/错误、CandidateLock overlay 约束和 importer contract。
- 不重复 G1 已有列/immutable trigger；只补 previous/current/revision+1/action/replay/CAS。
- 先做 fresh/replay/corruption 测试，再写 migration。

退出：已完成。Schema、migration replay、integrity/FK/checksum 全绿；当前进入 G4-B。

### G4-B 纯规则与 Resolver

状态：`completed`，commit=`9cd599a`，Scrutiny=`passed`，Runtime=`passed_isolated`。

- A→B→clear→A 状态机、current lock set digest、replay、freshness 真值表。
- 统一 preview/commit 影响分析；递归查询 layout/export/task 影响并规范化 digest。

退出：已完成。表驱动、排列不变量、known-answer、严格 codec 与无 IO freshness/impact 规则全绿；当前进入 G4-C。

### G4-C 事务命令与 API

状态：`completed`，commit=`179be50`，Scrutiny=`passed`，Runtime=`passed_isolated`。

- preview、commit、history、favorite、reject/restore、complete。
- SQLite writer 竞争、pointer CAS、唯一冲突重分类、丢响应 replay。
- 删除旧 `POST .../candidates/{candidateId}/lock` 权威入口和 JSON 双写。

退出：已完成。fresh SQLite + 真实 HTTP/事务覆盖成功、no-op、replay、revision conflict、impact changed、favorite/reject/history/complete 与双 writer；当前进入 G4-D。

### G4-D 工作流与下游门禁

状态：`completed`，commit=`894d1e8`，Scrutiny=`passed`，Runtime=`passed_isolated`。

- Workbench/ProductionState 提供 lock set 与 layout/export source summary。
- stale/unresolved 在 Server 阻止新正式 layout/export/package。
- 旧任务完成只能 historical，不更新 current。
- 新 Candidate 不自动改变定稿或下游 freshness。

退出：已完成。Workbench/ProductionState source summary、stale/unresolved/digest Server gate、运行中旧任务 historical fence、新 Candidate 不改定稿/下游 freshness 与 restart 均通过；当前进入 G4-E。

### G4-E Web 交互

状态：`completed`，commit=`3826611`，Scrutiny=`passed`，Runtime=`passed`。

- 收藏、定稿、更换、clear、废弃/恢复、历史。
- preview 影响弹窗，409 自动重新 preview 但不自动 commit。
- 排版页显示 stale 摘要与导出门禁，不提前实现 G5 换图/crop。

退出：已完成。DB Workbench 权威刷新、收藏/废弃/恢复、两阶段 lock/replace/clear、409 重新 preview 不自动 commit、历史和排版 stale 摘要均由真实浏览器 DB-only 路径通过；当前进入 G4-F。

### G4-F 迁移与端到端

状态：`completed`，commit=`81c922a`，Scrutiny=`passed`，Runtime/User=`passed`。

- 迁移 direct evidence/conflict/unresolved；不猜测 current。
- A→B→clear→A、布局/导出后更换、运行中任务、双窗口、restart/backup restore。
- Scrutiny 和 Runtime/User Review 按 G4 清单通过。

退出：已完成。legacy direct evidence/conflict/unresolved、A→B→clear→A、已导出后新 Candidate、双窗口、运行中任务、restart 和 backup restore 全部通过；状态=`G4_PASSED`，当前进入 G5-M0。

## 10. G5：成稿编辑器与确定性出版

### G5-M0 Fixture 与红灯

状态：`completed`，提交=`53b65e4`，Scrutiny=`passed`，Runtime=`passed_isolated`。

- 固定页漫、条漫、返修、故障、手机/AI fixture。
- 固定 LayoutDocument/font/assets/golden corpus 和性能规模。
- 建立 `test:render`、`test:migration:g5`、G5 E2E 脚本；先呈现可解释红灯。

退出：8 份 LayoutDocument、3 张本地 PNG、固定 Inter WOFF2、20 canvas/200 element 性能样本与 document/source/profile/asset manifest/RenderPlan known-answer digest 已固定；旧复制源图导出有真实临时 workspace 红灯见证；render/migration/E2E 命令以结构化非零报告列出各自后续 owner，不把未实现能力伪装为通过。

### G5-M1 E0 可丢弃技术原型

状态：`completed`；提交=`68b00cb`；ADR=`ADR-0016`；Scrutiny=`passed`；Runtime=`passed_isolated`。

- 至少比较两条完整薄切片，不只比较拖拽手感。
- 验证四格/自由图/旋转/crop/层级/气泡 round-trip、横竖排、IME/Undo、三次 sha、PDF/切片、受控字体、性能和许可证。
- 若一条方案明确通过全部硬门、许可证可接受且不需要新系统权限，Luna 可写技术 ADR 并继续。
- 若无方案通过、结论接近阈值或引入付费/限制性许可，停止并提交对比证据，不猜选。

退出：A（Konva adapter + DOM 输入 + 独立 HTML RenderScene + pinned Chromium）15 个硬门全部通过；B 在首个 1080×8192 resvg 切片 native abort，已由子进程隔离并作为失败证据。PNG/PDF/40 页/切片/字体 cmap/IME/100 命令/性能/许可证与视觉复核齐全，ADR-0016 已采纳。

### G5-M2 Shared Layout Domain Kernel

状态：`completed`；提交=`e93d70f`；Scrutiny=`passed`；Runtime=`passed_isolated`。

- 严格 LayoutDocument codec/normalization/digest/limits。
- 命令 reducer/inverse/batch atomicity、geometry/crop/reading order、rich text grapheme policy。
- adapter 私有状态、DOM、viewport/dpr 不得落盘。

退出：strict Document/Profile/Element/RichText/Publication codecs、JCS/source projection、受控 source/crop 复核、Unicode 17 grapheme、四类气泡路径、七类 preset、39 类命令 reducer/inverse/batch 与 history limits 均已实现；M2 定向 29/29、Shared 83/83、Server 536/536 通过。

### G5-M3 Schema overlay、Working Copy、编辑器外壳

状态：`in_progress`。

- Schema/migration、Working Copy CAS/autosave/recovery、路由和编辑器壳。
- 只保存 DB V1，不双写 legacy layout.json；历史正式 Revision 尚不由 autosave 自动创建。
- 多标签冲突有 recovery，不 last-write-wins。

### G5-M4 画格、图片、模板与裁切

- PanelFrame+contentImage、FreeImage、Shot tray、crop/cover/rotate/flip、模板/阅读顺序。
- 全部来源消费 G4 current CandidateLockRevision；源 Asset 不改写。

### G5-M5 富文本、气泡与字体

- FontAsset 受控 provision/sha/license/embedding。
- 横竖排范围富文本、IME composition、paste clean、overflow、四类气泡。
- 系统字体移除后结果不变；缺字体明确失败。

### G5-M6 来源返修、Revision、历史、预检

- stale 单张/批量 preview+digest+commit 与 crop 选择。
- LayoutRevision 线性不可变、精确 replay、SourceBinding、历史恢复成 Working Copy。
- preflight 与 warning acknowledgement；A→布局→B→解决→新 Revision。

### G5-M7 Renderer 与出版

- RenderPlan/RenderScene/AssetResolver/固定 renderer adapter。
- 持久 `layout_export` task、claim fencing、Outbox/recovery/current applicability。
- 页漫 PNG/PDF、条漫 slices/条件长图、`layout_publication` manifest、多 Artifact。
- 三次固定输入 sha 相同；真实文件可解码；迟到任务不覆盖 current。

### G5-M8 手机、AI、legacy cutover 与收尾

- 手机只读 route，网络断言无写请求。
- AI 只产 PendingEditorCommandSet；preview/apply/discard/expire，未经用户确认不改画布。
- 迁移可解析 legacy；unresolved 明确重建；删除旧复制源图导出和 runtime legacy 写入口。
- 性能、可访问性、安全、故障注入、文档、完成记录、Scrutiny、Runtime/User Review。

退出：五条 Runtime 路径和 G5 清单全绿，进入 `WAIT_G5_USER_ACCEPTANCE`。用户签收后才能写 `G0_G5_COMPLETE`。

## 11. Stop 条件

除固定人工门外，遇到以下情况立即暂停相关阶段：

- 需要真实 secret 出现在 argv/env 输出/日志/JSON。
- 工作树中用户改动与阶段改动重叠且无法无损保留。
- Schema/协议要求与已接受 ADR 冲突，继续会改变产品语义。
- E0 没有候选通过硬门。
- 测试必须访问外网、真实 provider 或非临时根才能通过。
- 需要删除历史数据、backup/archive 或使用 down migration。

一般测试失败、实现复杂或需要补测试不是暂停理由；应在授权范围内修复并继续。

## 12. 任务结束

- 更新本目录 `progress/findings/review_checklist/handoff`。
- 对持续价值功能建立 `功能完成记录`。
- 同步 `文档/00_索引/AI上下文入口.md`、路线图、相关架构/模块/验收文档。
- 合并长期有效结论到 `文档/记忆/MEMORY.md`，不写临时 todo。
- G5 签收后停止，不启动 G6 或视频。
