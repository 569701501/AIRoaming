---
doc_id: AIR-G05-REMAIN-FINDINGS-001
status: active
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: human, luna, reviewer
source: 代码、Git、v5 production evidence 与正式验收文档复核
---

# 当前事实与风险

## 1. 当前不可覆盖事实

- 当前分支为 `codex/g0-test-safety-net`。
- cutover evidence appCommit 为 `9227e8dfefde59a25f81b53a41074f3971c24d05`；当前 compatible implementation commit 为 `d8ed6cc`；后续 G5 提交不构成 cutover 身份漂移，旧 evidence 继续绑定历史 appCommit，不重签。
- S0、W1、R0B、SH-10 已完成。
- v5 C0～C7 activation 已完成；production status=`completedThrough=C7`。
- 当前 evidence=`sha256:987d9a9466c220544ea010b6d74ead34971b3b2eb1188388bb3a4ba66c6a1452`。
- 首笔业务写、R2 OBS-01～10、G4-A～F 与 G5-M0～M7 已通过；G5-M8 尚未完成。
- 当前唯一执行入口为 `luna_current_handoff.md`，当前状态为 `G5_M8_IN_PROGRESS`。

## 2. 已完成能力不能等同于总目标完成

- W1 已补齐 Story/Storyboard/Preflight 的 DB-only Web/API 与 fresh SQLite E2E。
- R0B release shadow、SH-10 和 v5 C0～C4 已形成真实 evidence。
- C5/C6/C7 与 R2 均已关闭；OBS-06/07/08 中暴露的真实缺口已分别修复并复核，允许进入 G4。
- G4-A～F 已总体关闭为 `G4_PASSED`；G5-M0～M7 已完成，M8 仍待执行。

## 3. 固定阶段顺序

```text
AUTH-C5（已消费）
  -> C5_C6（已完成）
  -> AUTH-C7/C7 activation（已完成）
  -> FIRST_BUSINESS_WRITE_BOUNDARY
  -> R2 OBS-01～10（已完成）
  -> G4-A～F
  -> G5-M0～M8
  -> WAIT_G5_USER_ACCEPTANCE
```

除明确人工门和真实 blocker 外，前一步通过后立即进入下一步。

## 4. 无排期决定

- 不用工期、预计天数、开始/结束日期指导 Luna。
- 日期只用于文档、Git 和 evidence 追溯，不构成等待条件。
- v5 `maintenanceWindow` 是已完成 C1 的不可变安全证据，不是 C5～G5 的排期。
- 普通实现失败、测试失败和返工由 Luna连续处理；不能将它们升级成不必要的人类审批。
- G5 E0 无候选通过硬门、需要付费/新系统权限或重大产品决策时，才停下请用户决策。

## 5. 主要风险与控制

| 风险 | 影响 | 控制 |
| --- | --- | --- |
| 旧文档仍写 `WAIT_R0B_AUTH` | Luna 重复已完成真实动作或错误停止 | 唯一入口 + status/evidence 只读断言 |
| 旧 v3 AUTH-C5=`not_ready` | 错误认为 v5 C4 不具备申请资格 | 当前矩阵改为 v5 `waiting_human_authorization` |
| 把历史窗口当剩余排期 | 无故等待、拖慢执行 | 明确窗口只绑定 C1 历史证据 |
| dirty worktree 混入用户改动 | 丢失用户内容、提交不可审计 | 阶段清单、窄暂存、禁止 add -A/reset/rebase |
| file/DB fallback | 双事实源、数据分叉 | capability 单选、失败不 fallback、网络断言 |
| G4/G5 普通返工变成人工门 | 频繁中断 | 只保留固定授权门和 blocker 停止点 |
| G5 过早锁画布技术 | renderer 不确定或许可证风险 | E0 两条完整薄切片和硬门 |

## 6. 当前结论

```text
plan_ready = yes
schedule_policy = NO_CALENDAR_SCHEDULE
current = G5_M8_IN_PROGRESS
next = G5_MOBILE_AI_LEGACY_CLOSEOUT
```

## 7. G4-A 稳定结论

- Candidate runtime 状态闭集固定为 `generated/rejected/superseded`；favorite 与 current final 分离。
- 当前定稿只由 CandidateLockRevision 与 Shot current pointer 表达；线性链不允许分叉、跳号、从非 current 接续或普通清空 pointer。
- 0012 是 forward-only overlay，不重复 G1 列、check 或 immutable trigger；应用启动要求精确成功的 12 段 ledger。
- legacy 只有 Shot 直接 `lockedCandidateId` 且 Candidate/Asset/scope 均可验证时才建 v1；selected 只转 favorite，locked status 不推断 current。
- G4-A commit=`79dc806`，Scrutiny=`passed`，Runtime=`passed_isolated`；G4 总体 Runtime/User Review 仍待 G4-F。

## 8. G4-B 稳定结论

- 状态机只表达 create/no-op/invalid；精确 replay 必须在 expected conflict 之前由 current.previous/action/target 判定。
- complete lock set digest 只包含按 Unicode 字典序排列的 `{shotId,candidateLockRevisionId}`；Candidate label/favorite/order 和数据库行顺序不参与。
- incomplete/unresolved 的 `sourceApplicability` 与 digest 必须为 null；strict codec 拒绝未知字段、非规范排序、重复或交叉分类。
- legacy unresolved 信封即使带有看似完整的 ID 也保持 unresolved；完全无 source revision 时不猜 current。
- impact digest 只包含规范化 authority ID 集与 intent，不包含数量、展示字段、时间或路径；lock_set task 同时按 chapter source identity 和当前 digest 限定。
- freshness 是 binding/current pointer/digest 的查询时派生，revision position 与 source resolution 分轴，Export completionApplicability 不被返修改写。
- G4-B commit=`9cd599a`，Scrutiny=`passed`，Runtime=`passed_isolated`；事务、API、竞争和用户路径从 G4-C 继续。

## 9. G4-C 稳定结论

- preview/commit 在同一规范化 impact resolver 上运行；commit 事务顺序固定为 replay、expected revision、FSM/no-op、目标/G2 门禁、impact digest、revision insert、Shot pointer CAS。
- 丢响应重试只有 previous/action/target 精确匹配才返回 replay；SQLite writer/唯一/CAS 冲突重新读取后仍不匹配则返回 revision conflict。
- favorite/reject/restore 不改变 current final；current final 不可废弃；complete 只接受所有 active Shot 的完整 current lock set。
- 旧 Server lock HTTP 路由和旧 DB 直接 revision/pointer writer 已删除；file-mode 兼容投影保留，Web 新 API 接入留给 G4-E。
- G4-C commit=`179be50`，Scrutiny=`passed`，Runtime=`passed_isolated`；工作流 summary、下游门禁与迟到任务从 G4-D 继续。

## 10. G4-D 稳定结论

- `candidateSources` 是 Workbench/ProductionState 共用的 lock set、Working Copy、current Layout/Export 与 gate 总览；所有 freshness 每次从 DB authority 重算。
- stale/unresolved/digest mismatch 在 Server 事务内阻断新 Working Copy/formal Layout/export/package；更换定稿不删除、不清空、不改写旧产物或 current pointer。
- 运行中旧下游任务进入 impact/cancel，completion-time fence 只能返回 historical；新 Candidate 不自动改变 Shot current revision、lock set digest 或下游 freshness。
- DB preview 使用只读事务，不消费首次业务写标记；Candidate DB 写 owner 已从旧 ImageCandidateService 更新为 CandidateLockRepository。
- G4-D commit=`894d1e8`，Scrutiny=`passed`，Runtime=`passed_isolated`；其 Web 交互后续已由 G4-E 完成，总体 migration/E2E/backup restore 从 G4-F 继续。

## 11. G4-E 稳定结论

- DB Workbench 每次按数据库 authority 刷新候选收藏、废弃、current final 与来源适用性，不再由进程内旧项目快照遮蔽最新决策。
- Web lock/replace/clear 只使用 preview→显式确认→commit；旧一键 lock 调用已删除，409 只重新 preview，绝不自动提交。
- favorite/reject/restore 与 current final 保持正交；排版/导出页消费 Server 来源摘要，Server 事务门禁仍是安全权威。
- G4-E 不修改旧 Layout/Export/Asset，不实现画布换图或 crop；成功浏览器路径使用临时 DB、公开 HTTP、持久化 Worker 和 fake provider。
- G4-E commit=`3826611`，Server 533/533、Shared 54/54、Playwright 1/1；Scrutiny=`passed`，Runtime=`passed`。migration、backup restore 和总体 G4 Review 从 G4-F 继续。

## 12. G4-F 与总体 G4 稳定结论

- legacy current 只从可验证直接证据恢复；Candidate 缺失、Asset 未 ready、scope 错误与既有 runtime current 冲突分别留下稳定 blocker，不猜最新候选。
- A→B→clear→A、已导出后新 Candidate、双窗口 409 重预览、运行中任务 historical fence、restart 与 DB-only backup restore 均有运行证据。
- 相同图片密钥重复保存保持同一 secretRef/fingerprint；缺少受控清理事件时，新密钥轮换在覆盖 SecretStore 和运行内存前 fail-closed。
- G4-F commit=`81c922a`；Server 535/535 两轮、Shared 54/54、migration 78/78、Playwright repeat 3/3；Scrutiny=`passed`，Runtime/User=`passed`，总体=`G4_PASSED`。

## 13. G5-M0 稳定结论

- 固定 corpus 位于 `tests/fixtures/layout/`：8 份 LayoutDocument fixture、3 张本地 PNG、固定 Inter WOFF2、20 canvas/200 element 性能规模；corpus digest=`sha256:9acf40013492dd82003fc24af944897db834203e11d02cacee1c457ebe115527`。
- 每份 fixture 保存 document/source lock set/publication profile/asset manifest/RenderPlan known-answer digest；Shared JCS/SHA-256 与独立字节 sha 校验连续三次通过。
- 文件模式旧出口已由真实临时 workspace 证明为候选原图逐字节复制，不能冒充 1080×1920 PNG 合成；DB 旧出口仍只发布 legacy `layout.json`。
- `test:render`、`test:migration:g5`、`test:e2e:g5` 已存在并返回 machine-readable 红灯；M0 不使用 skip/todo，也不伪造 PNG/PDF/slice 或浏览器语义结果。
- Inter 拉丁字体字节与 OFL 标识已固定；受控 CJK 字体、实际 cmap/许可证审计和正式输出由 M1 E0 关闭。M0 commit=`53b65e4`，Scrutiny=`passed`，Runtime=`passed_isolated`。

## 14. G5-M1 稳定结论

- ADR-0016 选择 A：Konva 只作交互 adapter，DOM 负责 IME 输入，正式 PNG/PDF 来自独立 HTML RenderScene + pinned Chromium；HTML/Konva JSON/viewport/dpr 不落盘。
- A 的 15 个门全部通过：PNG 三次及 golden sha 相同、PDF 三次规范化 sha 相同、40 页/字体嵌入通过、5 个最大 8192 高切片与 20 段 source pixel digest 完全一致。
- Noto Sans CJK SC/Inter 固定字节经 fontkit cmap 审计；实际文字存在，emoji 缺 glyph 会预检失败；渲染期间外网请求 0。
- B 的 resvg 2.6.2 在首个 1080×8192 切片 native abort，子进程隔离只保证报告不中断，不能让 B 通过。
- 原型为归档证据；M2 必须用版本化 Shared 实现锁定 Unicode grapheme policy，不能沿用原型的宿主 `Intl.Segmenter` 作为生产契约。

## 15. G5-M2 稳定结论

- `packages/shared/src/layout/` 已形成无 DOM、数据库、文件系统和 Konva 依赖的 Layout V1 生产内核，覆盖严格 document/profile/element/rich-text/publication codec、JCS/digest、来源投影、几何/crop、气泡路径、七类 preset 和 39 类命令。
- grapheme policy 固定为 `unicode_17_0_uax29_rev47`，使用 `unicode-segmenter@0.17.0`；不依赖客户端宿主 `Intl.Segmenter`。
- command reducer 对未知 payload、locked 写入、非原子 batch、无效 occupied-panel 模板应用和历史上限均 fail-closed；inverse、changed IDs 与 preflight scopes 可重复计算。
- 固定 8 份 fixture 已改由生产 LayoutDocument codec 验证；M2 定向 29/29、fixture 3/3、Shared 83/83、Server 536/536，全仓 typecheck、E2E typecheck、build 通过。
- M2 commit=`e93d70f`，Scrutiny=`passed`，Runtime=`passed_isolated`；Server 保存时注入真实 Asset sha/尺寸属于 M3/M4，字体 provision 属于 M5，正式 renderer 属于 M7。

## 16. G5-M3 稳定结论

- 0013 是 forward-only G5 Working Copy overlay；应用启动要求精确成功的 13 段 ledger，G1 0001～0008 迁移字节未改写。
- Working Copy 只保存 DB V1，使用 800ms autosave、5 MiB batch 上限和 expected rowVersion CAS；no-op/replay 明确，多标签冲突保留 recovery，不 last-write-wins。
- Server 初始化/保存会重算 G4 current lock/source identity，并按 DB ready Asset 的 sha/尺寸复核新增或变更 source/crop/font；autosave 不创建正式 Revision、不写 legacy `layout.json`。
- 桌面编辑器外壳具备页面导航、选择、拖拽、属性、图层、锁定/隐藏、对齐/分布与内存 Undo/Redo；窄于 1024px 只读且 0 写入。
- 默认 E2E 已按 file/DB 两种服务模式分离并穷尽登记全部 spec；M3 替换页面时暴露的 G4 来源警告回归已修复，原始默认 E2E 7/7 通过。
- M3 commit=`ec71594`；Shared 86/86、Server 544/544、E2E env 33/33、file 4/4、DB 3/3；Scrutiny=`passed`，Runtime/User=`passed`。当前进入 M4。

## 17. G5-M4 稳定结论

- `GET .../layout/source-catalog` 是只读投影，只消费 Shot current CandidateLockRevision 与 ready Asset；旧 lock ID 不会被前端恢复使用。
- PanelFrame/contentImage 是一个顶层复合对象，FreeImage 独立占顶层；detach/attach 是可撤销 batch，模板保留所有非 panel 对象和已占用图片。
- 可见 Shot 放置排除 hidden、opacity=0、完全画布外和隐藏的 nested contentImage；Shot tray 不把仅存在但不可见的图片算成已放置。
- cover crop 的 preview/Shared/Server 使用同一 source dimensions + base scale 语义；空洞裁切拒绝，zoom/offset/rotation/flip 不改源 Asset。
- Shared 批量规则按页漫每 4 镜头生成 page、条漫每 1 镜头生成 strip_section；canvas 与 panel reading order 均通过正式命令保存和重排。
- M4 commit=`93a58b2`；Shared 91/91、Server 546/546、E2E env 33/33、file 4/4、DB 4/4、M4 定向 1/1；Scrutiny/Runtime=`passed`。当前进入 M5。

## 18. G5-M5 稳定结论

- 生产字体固定为 `@openfonts/noto-sans-sc_chinese-simplified@1.44.9` 的 400/700 WOFF2；Server 逐字节复核 sha/size、fontkit cmap、实际 weight/style、OFL-1.1 与 embeddingAllowed，再通过 Asset staged→`asset.promote` Outbox→ready 提升。
- 浏览器只从 verified Asset file API 加载 FontFace，字体 family 从 Asset ID 的完整字符编码生成；不读取本机字体列表，不声明 local/system fallback，缺字体、sha mismatch、unsupported format、缺 glyph 或 embedding 禁止均 fail-closed。
- 横/竖排富文本、IME composition、纯文本 paste、Unicode grapheme 选区与范围样式、overflow、四类气泡和单尾巴都保存为同一 LayoutDocument command；文字模式不移动气泡，选择模式移动复合对象。
- M5 commit=`cd35053`；Shared 96/96、Server 549/549、file 4/4、DB 5/5、M5 repeat 3/3；Scrutiny/Runtime=`passed`。PDF 字体嵌入仍归 M7，当前进入 M6。

## 19. G5-M6 稳定结论

- 来源返修只消费 G4 current CandidateLockRevision 与 ready Asset；preview 固定逐图 cropMode、结果 document digest 和 replacement digest，commit 在写事务内重算并只更新 Working Copy，旧 Revision/Export/Asset 不变，丢响应只精确 replay。
- 正式保存事务顺序固定为 unsealed LayoutRevision→LayoutSourceBinding[]→seal→Chapter current pointer→Working Copy basedOn；历史恢复只替换 Working Copy，不移动 current、不改历史。
- 预检 issueKey/preflightDigest 不含文案或时间，source/font/image/glyph 阻止 Revision，overflow 等 warning 需要显式确认；重复或不属于当前 report 的 acknowledgement 均 fail-closed。
- 0014 forward-only migration 只替换旧 source binding insert trigger：LayoutDocument `sourceDigest` 是来源 ID 与 Asset sha 的复合摘要，不能直接等同 `Asset.sha256`；scope、revision unsealed、Candidate/LockRevision、ready Asset 与 sha 非空门禁继续保留，seal trigger 负责文档/绑定逐项一致。
- M6 commit=`429ec69`；Shared 104/104、Server 551/551、E2E env 33/33、file 4/4、DB 6/6，Undo/Redo 补强后 M6 定向 1/1；Scrutiny/Runtime=`passed`。Renderer/publication 仍归 M7，mobile/AI/legacy/总体路径仍归 M8，当前进入 M7。

## 20. G5-M7 稳定结论

- 正式 renderer 只消费 sealed LayoutRevision、固定 profile/digest 和 DB ready Asset/Font bytes；独立 RenderScene 不读取 Working Copy 或编辑器 DOM，不执行用户 HTML/JS。
- page PNG/PDF 三次 sha 分别固定为 `e0eba324...b10b4f8` 与 `5afe9ca2...5359364`；20 段条漫生成五个连续 1080×7680 slice；真实 CJK PDF 包含嵌入 subset/ToUnicode 且无本地路径。
- publication 创建事务封存 TaskSource；worker 使用 `layout-render/1`、maxAttempts=2、claimToken/heartbeat，staged Asset 经精确 Outbox promotion 后再原子 finalize。
- staged recovery 不重新渲染或重复建 Artifact；取消不复活，迟到任务只记 historical；Artifact file API 复核 project/chapter/publication scope 与 ready sha。
- 0015 forward-only triggers 固定现代 publication/task/artifact/ready/attempt 映射；G1 manifest/release identity 已同步到 15 migrations。
- M7 commit=`d8ed6cc`；Shared 108/108、Server 555/555、`test:render=green`、M7 DB-only Playwright 1/1；Scrutiny/Runtime=`passed`。当前进入 M8。
