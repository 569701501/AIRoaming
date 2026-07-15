---
doc_id: AIR-G05-REMAIN-TEST-001
status: active
created: 2026-07-14
updated: 2026-07-15
owner: AI漫游项目
audience: luna, qa, reviewer
source: G0 E2E harness、G1/G2/G4/G5 验收清单
---

# G0～G5 剩余连续施工测试与证据矩阵

## 1. 证据规则

每次运行至少记录：

```text
phase / testId / runId
git SHA + dirty summary
Node / pnpm / Prisma / Chromium / renderer version（适用时）
完整命令
开始结束时间、耗时、退出码
spec/test 数量
临时根 marker 与 persistence mode（脱敏）
失败摘要或产物 digest
```

证据建议放在：

```text
文档/05_执行与记录/任务记录/2026-07-14_G0至G5剩余连续施工/evidence/<phase>/
```

禁止把真实 secret、真实绝对路径、用户名、token 内容、Keychain 输出或完整用户数据提交到 evidence。

## 2. 基线命令

### 每个代码阶段至少运行

```bash
corepack pnpm typecheck
corepack pnpm --dir apps/server build
corepack pnpm --dir apps/web build
```

### 阶段性全量门禁

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm typecheck:e2e
corepack pnpm --dir apps/server build
corepack pnpm --dir apps/web build
corepack pnpm --dir apps/server prisma:validate
corepack pnpm --dir apps/server g1:manifest:check
corepack pnpm --dir apps/server g1:schema:check
corepack pnpm --dir apps/server g1:migration:check
corepack pnpm --dir apps/server db:capabilities -- --check --format json
corepack pnpm test:e2e:env
corepack pnpm test:e2e
```

高风险阶段再运行：

```bash
corepack pnpm test:e2e:repeat
git diff --check
```

若命令或脚本尚不存在，先在对应实现切片增加并验证；不得在证据里记录一个不存在的命令。

## 3. S0 测试矩阵

| ID | 场景 | 期望 | 初始状态 |
| --- | --- | --- | --- |
| S0-01 | 原样根 `pnpm test` | 能重现并定位历史 5s timeout，或证明已不存在 | `passed` |
| S0-02 | 慢测试单独运行 | 无断言失败/资源泄漏；原因可解释 | `passed` |
| S0-03 | 默认根测试连续 3 次 | 三次退出 0，不依赖临时 CLI 参数 | `passed` |
| S0-04 | R0-A 定向 cutover/SecretStore | production adapter、runner、seal、resume/rollback 全绿 | `passed_isolated` |
| S0-05 | disposable Keychain 证据复核 | 只用临时 HOME/keychain；默认用户 Keychain=0 | `passed_isolated` |
| S0-06 | server 全量 | 全部 spec/test 通过；数量如实记录 | `passed` |
| S0-07 | type/build/Prisma/G1/capability | 全绿；`blockedIds=[]` | `passed` |
| S0-08 | SEC-10 sentinel | DB/settings/report/log/task/artifact/export fixture 命中=0 | `passed_isolated` |
| S0-09 | diff/status | 无 whitespace error；未知用户改动未被暂存 | `passed` |

R0-A 定向测试以当前 `R0-R2真实切换施工包/evidence_and_test_matrix.md` 为准，不能把旧的 69/472 数量机械抄成新运行结果。

## 4. W1 单元与集成矩阵

### 4.1 API/Adapter

| ID | 场景 | 期望 | 状态 |
| --- | --- | --- | --- |
| W1-API-01 | file capability | 仅调用 legacy adapter | `passed_isolated` |
| W1-API-02 | `g2_db` capability | 仅调用 G2 DB adapter | `passed_isolated` |
| W1-API-03 | DB 请求 409/500 | 不 fallback file，不发第二个写请求 | `passed_isolated` |
| W1-API-04 | Story WC CRUD/confirm | URL/method/body/response 符合 Shared contract | `passed_isolated` |
| W1-API-05 | Board WC CRUD/shot/confirm | URL/method/body/response 符合 Shared contract | `passed_isolated` |
| W1-API-06 | Preflight preview/confirm | expected source/current/rowVersion 完整 | `passed_isolated` |
| W1-API-07 | unknown/非法字段 | strict reject，稳定错误 envelope | `passed_isolated` |

### 4.2 Server route

| ID | 场景 | 期望 | 状态 |
| --- | --- | --- | --- |
| W1-ROUTE-01 | 静态扫描 preflight confirm | Controller 相同 decorator 仅 1 个 | `passed` |
| W1-ROUTE-02 | DB confirm request | 调用 PreflightRevision 语义，创建/重放 revision | `passed_isolated` |
| W1-ROUTE-03 | file confirm request | 保持 file-mode 现有语义 | `passed_isolated` |
| W1-ROUTE-04 | DB body 使用 legacy 形态 | 明确拒绝，不 silent fallback | `passed_isolated` |
| W1-ROUTE-05 | preview source changed | 返回稳定 stale/reason | `passed_isolated` |

### 4.3 Store/Component

| ID | 场景 | 期望 | 状态 |
| --- | --- | --- | --- |
| W1-UI-01 | Story create/update/discard/confirm | pending/current/history 状态准确 | `passed_isolated` |
| W1-UI-02 | Board create shot/update/confirm | stable shot、rowVersion、source 绑定准确 | `passed_isolated` |
| W1-UI-03 | Preflight blocker→ready→confirm | server-derived preview，不前端伪造 | `passed_isolated` |
| W1-UI-04 | 409 conflict | 本地内容保留、server 状态刷新、需重新确认 | `passed_isolated` |
| W1-UI-05 | dirty/pending gate | 旧 current 可看，新正式下游被阻止 | `passed_isolated` |
| W1-UI-06 | stale/historical | 旧产物可看，不静默删除/覆盖 | `passed_isolated` |
| W1-UI-07 | reload/restart | DB Working Copy/current/history 恢复 | `passed_isolated` |

## 5. W1 DB-mode E2E

前置断言：

- fresh 临时 SQLite 已执行正式 migration。
- server 环境显式为 `AIROAMING_PERSISTENCE_MODE=db`。
- Workbench snapshot 返回 `versioningCapability.mode=g2_db`。
- 真实 HOME/Keychain/provider/外网操作次数为 0。

| ID | 用户路径 | 关键断言 | 状态 |
| --- | --- | --- | --- |
| W1-E2E-01 | Story dirty 未确认 | 旧 current 不变；新 Board 被 gate | `passed_isolated` |
| W1-E2E-02 | Story publish 后 stale | Board/Preflight 历史保留且 stale reason 准确 | `passed_isolated` |
| W1-E2E-03 | 双页签冲突 | 并发 browser-owned API client 一成功一 409；服务端保留胜者内容，409 客户端不得覆盖 | `passed_isolated` |
| W1-E2E-04 | 历史复制 | 旧 version 不改；新 WC/confirm 产生新 version | `passed_isolated` |
| W1-E2E-05 | Story→Board→Preflight | 第 2～4 步全部通过 G2 DB API | `passed_isolated` |
| W1-E2E-06 | server restart | 同一 DB 读回 current/WC/history/freshness | `passed_isolated` |
| W1-E2E-07 | file-mode regression | 原 4 条 E2E 仍通过，无 DB 双写 | `passed_isolated` |
| W1-E2E-08 | repeat each 3 | 无 flaky/竞态/端口与清理冲突 | `passed_isolated` |

必须保存至少：冲突页、stale 页、历史页和 Preflight confirm 的 screenshot/trace；截图不得包含真实路径/秘密。

## 6. R0B/R1/R2 证据矩阵

本节不替代 R0-R2 原矩阵，只定义总计划的必须摘要。

| ID | 阶段 | 必须证据 | 当前状态 |
| --- | --- | --- | --- |
| RC-01 | R0B release freeze | appCommit/effective manifest/tool versions/clean tree | v5 `passed` |
| RC-02 | shadow A/B | 两个 fresh target，16 slices、counts、digests 一致 | v5 `passed_release_shadow` |
| RC-03 | backup/restore rehearsal | sealed、verify、materialize/API/Asset hash | v5 `passed` |
| RC-04 | SH-10 | 人类 Migration reviewer 签署 | v5 `passed_human_review` |
| RC-05 | C0 | 无 AUTH、只读、plan/root/capability/shadow passed | v5 `passed_read_only` |
| RC-06 | C1～C4 | maintenance/snapshot/fresh DB/final/ready/backup/restore | v5 `passed`；evidence=`69d08d7b...6328642` |
| RC-07 | C5～C6 | closed DB smoke、metadata archive、first write 空 | `passed_real`；C6_READY=`da5227c0...f48f19b` |
| RC-08 | C7 | AUTH 绑定、activate、resume、file guard、首写 | `passed_real`；evidence=`987d9a94...6a1452` |
| RC-09 | OBS-01～10 | DB-only 观察、重启、任务、备份、安全、rollback | `passed_real`；双 Review=`passed` |

RC-09 现场：OBS-01～10 全部通过。OBS-06 由 0011 协调 purge 修复关闭；OBS-07 sealed backup/fresh restore 通过；OBS-08 两章和 67/67 Asset 可读；OBS-09 原 archive/运行态不变；OBS-10 为 0 secret hit。

真实证据留在仓库外私有 run root；仓库只登记 digest、状态、计数和脱敏结论。

## 7. G4 矩阵摘要

完整唯一 ID 以 `G4候选定稿返修验收清单.md` 为准。本计划的阶段门如下：

G4-A～F 已总体通过。G4-F 提交 `81c922a` 关闭 legacy direct evidence/conflict/unresolved、完整 A→B→clear→A、已导出后新 Candidate、双窗口、restart/backup restore 与总体双 Review；Server 80 files/535 tests 两轮、Shared 54/54、migration 78/78、DB-only Playwright repeat 3/3。

| ID | 场景 | 必须结果 | 状态 |
| --- | --- | --- | --- |
| G4-GATE-01 | fresh/replay migration | checksum/integrity/FK/trigger 全绿 | `passed_isolated`（G4-A） |
| G4-GATE-02 | A→B→clear→A | 4 条线性 immutable revision/current 正确 | `passed_db_api_and_browser` |
| G4-GATE-03 | lost response | replay，不重复 revision | `passed_db_api`（G4-C） |
| G4-GATE-04 | writer race | 一成功一 conflict，无双 current | `passed_db_api`（G4-C） |
| G4-GATE-05 | impact changed | 409，重新 preview，不自动 commit | `passed_db_api_and_browser`（G4-C/E） |
| G4-GATE-06 | favorite/reject | 不改变 lock set/layout/export freshness | `passed_db_api_and_summary`（G4-C/D） |
| G4-GATE-07 | replace after layout/export | 旧产物不变；新工作 stale | `passed_db_gate`（G4-D） |
| G4-GATE-08 | running task replace | 迟到结果只 historical | `passed_completion_fence` |
| G4-GATE-09 | legacy migration | direct evidence 才建 v1；冲突 unresolved | `passed` |
| G4-GATE-10 | Web Runtime | 8 条 G4 Runtime 路径与截图/trace | `passed_repeat_3` |
| G4-GATE-11 | restart/backup restore | revision/current/freshness 一致 | `passed` |
| G4-GATE-12 | legacy authority scan | runtime 无 selected/locked/旧 lock API 权威路径 | `passed_server_and_web`（G4-C/E） |

最低全量命令：

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm --dir apps/server prisma:validate
corepack pnpm typecheck:e2e
corepack pnpm test:e2e
corepack pnpm test:e2e:repeat
```

## 8. G5 矩阵摘要

### 8.1 M0 fixture 与红灯

| ID | 场景 | 必须结果 | 状态 |
| --- | --- | --- | --- |
| G5-M0-01 | 8 份正式 fixture | 文件名、文档根、用途与契约一致 | `passed` |
| G5-M0-02 | known-answer | document/source/profile/asset manifest/RenderPlan digest 可重算 | `passed` |
| G5-M0-03 | 固定 bytes | 3 PNG 可解码且尺寸/sha 正确；Inter WOFF2 sha/许可标识固定 | `passed_isolated` |
| G5-M0-04 | 性能规模 | 20 canvas/200 element | `passed` |
| G5-M0-05 | legacy copy 红灯 | 旧“PNG 页面”与候选源 bytes 相同，不能冒充合成 | `passed_red_witness` |
| G5-M0-06 | renderer 红灯 | 缺 renderer/semantic/CJK font 时结构化非零，不伪绿 | `passed_red_witness` |
| G5-M0-07 | migration/E2E 红灯 | 有明确 code、owner milestone，无 skip/todo | `passed_red_witness` |
| G5-M0-08 | 回归 | fixture 3×、Server 536/536、type/build/E2E type | `passed` |

### 8.2 E0 硬门

G5-E0-001～010 必须逐项有数值和产物证据：两条薄切片、round-trip、横竖排、IME/Undo、三次 PNG sha、PDF/slices、受控字体、性能、依赖/许可证、ADR。任一硬门失败，M2～M8 不得开始。

### 8.3 Domain/DB/Web/Renderer

| ID | 场景 | 必须结果 | 状态 |
| --- | --- | --- | --- |
| G5-GATE-01 | strict codec/digest | unknown/limits reject，known-answer/round-trip | `passed` |
| G5-GATE-02 | command/Undo/IME | batch 原子，一次 Undo，composition 无脏命令 | `passed_m2_m5` |
| G5-GATE-03 | WC autosave/conflict | reload 可恢复；双标签不静默覆盖 | `passed` |
| G5-GATE-04 | LayoutRevision | 显式保存、线性 immutable、replay 准确 | `passed_m6` |
| G5-GATE-05 | source replacement | preview/digest/commit，crop 选择明确 | `passed_m6` |
| G5-GATE-06 | page editor | frame/image/crop/layer/text/balloon/font 可恢复 | `passed_m5`：frame/image/crop/template/read order/text/balloon/font 均已通过 |
| G5-GATE-07 | strip editor | 20 段、虚拟化、重排/改高/竖排 | `partial_m5_passed`：分段生成/新增/重排/竖排已通过；20 段虚拟化与改高继续由 M7/M8 总体路径关闭 |
| G5-GATE-08 | deterministic PNG | 同输入三次 sha 相同，可解码/尺寸正确 | `passed_m7` |
| G5-GATE-09 | PDF | 页数/MediaBox/字体/embedding 正确 | `passed_m7` |
| G5-GATE-10 | slices/long image | 顺序、尺寸、sha；像素无缝拼回 | `partial_m7_passed`：20 段连续切点、尺寸/sha/解码通过；总体像素拼回路径归 M8 |
| G5-GATE-11 | persistent task | restart/retry/claim lost/迟到不切 current | `passed_m7` |
| G5-GATE-12 | mobile | 只读且网络层 0 写请求 | `not_run` |
| G5-GATE-13 | AI pending | 未 apply 不改画布；stale source 拒绝 apply | `not_run` |
| G5-GATE-14 | legacy cutover | 可解析转换；unresolved 明确重建；旧写后门删除 | `not_run` |
| G5-GATE-15 | security/resource | 外网/file scheme/secret=0；大小/时间/内存上限 | `partial_m7_passed`：renderer 网络/path/output limit 已通过；总体资源/故障矩阵归 M8 |

### 8.3.1 M4 画格/图片/模板/裁切证据

| ID | 场景 | 结果 | 状态 |
| --- | --- | --- | --- |
| G5-M4-01 | current source catalog | Shot current lock、ready Asset sha/尺寸与 source digest 精确一致；旧 lock 无回退 | `passed_db` |
| G5-M4-02 | PanelFrame/FreeImage | nested contentImage、detach/attach batch、顶层自由图可恢复 | `passed_shared_browser` |
| G5-M4-03 | Shot tray 可见放置 | hidden/opacity0/画布外不计数；panel/free 可计数 | `passed_shared_browser` |
| G5-M4-04 | 7 类模板 | occupied 和非 panel 对象不丢失；少画格 fail-closed | `passed_shared_browser` |
| G5-M4-05 | cover crop | zoom/offset/rotate/flip 非破坏；空洞拒绝；源 sha 不变 | `passed_shared_server_browser` |
| G5-M4-06 | 页漫/条漫批量 | 5 镜头页漫=4+1 两页；3 镜头条漫=3 段 | `passed_shared` |
| G5-M4-07 | 顺序与保存 | panel reading order/canvas reorder 写入 DB Working Copy | `passed_browser_db` |
| G5-M4-08 | 完整门禁 | Shared 91、Server 546、env 33、file 4、DB 4、M4 1 | `passed` |

### 8.3.2 M5 富文本、气泡与受控字体证据

| ID | 场景 | 结果 | 状态 |
| --- | --- | --- | --- |
| G5-M5-01 | 字体字节与许可 | 400/700 WOFF2 的 sha/bytes、7,898 code points、4,109 ranges、weight/style、OFL-1.1 固定 | `passed_static_runtime` |
| G5-M5-02 | Asset 生命周期 | project provision 走 staged→Outbox→ready，重复 provision 幂等，DB/JSON 无 base64 | `passed_db` |
| G5-M5-03 | 同源字体与系统隔离 | catalog/file/save 使用同一 ready Asset；FontFace family 由完整 Asset ID 编码，无 local/system fallback | `passed_server_browser` |
| G5-M5-04 | IME/paste/grapheme | composition 一次 Undo；HTML paste 只留纯文本；Unicode grapheme 选区不切半 | `passed_shared_browser` |
| G5-M5-05 | 范围样式与横竖排 | 字体/字号/粗斜体/颜色/描边/字距一次 Undo；horizontal/vertical mixed/upright 可恢复 | `passed_shared_browser_db` |
| G5-M5-06 | 气泡与模式隔离 | 四类固定路径、单尾巴可调；文字模式不移对象，选择模式移动复合对象 | `passed_shared_browser` |
| G5-M5-07 | 预检 | 缺字体、sha mismatch、unsupported、缺 glyph、embedding 禁止、overflow 均明确失败；正式按钮禁用 | `passed_shared_server_browser` |
| G5-M5-08 | 完整门禁 | Shared 96、Server 549、env 33、file 4、DB 5、M5 repeat 3 | `passed` |

### 8.3.3 M6 来源返修、Revision、历史与预检证据

| ID | 场景 | 结果 | 状态 |
| --- | --- | --- | --- |
| G5-M6-01 | stale 来源 preview | 单张/批量返回 from/to、逐图 cropMode、result crop、replacement/document digest | `passed_shared_server_browser` |
| G5-M6-02 | commit 与 replay | 写事务内重算当前来源与 digest，只更新 WC；成功响应丢失后 expected+1 精确 replay | `passed_db` |
| G5-M6-03 | 线性不可变 Revision | unsealed→bindings→seal→current→WC basedOn 原子完成；previous/revision/current 同作用域 | `passed_migration_db` |
| G5-M6-04 | 历史与恢复 | current/stale/unresolved 查询稳定；恢复只覆盖 WC，不移动 current、不改历史 | `passed_server_browser_db` |
| G5-M6-05 | 正式预检 | source/font/image/glyph 阻止 revision；overflow 等 warning 需确认；issueKey/preflightDigest 稳定 | `passed_shared_server_browser` |
| G5-M6-06 | acknowledgement | 缺确认阻止保存；重复或不属于当前 report 的 key fail-closed | `passed_contract_db` |
| G5-M6-07 | 0014 forward migration | 只修复复合 sourceDigest 与 Asset.sha256 的错误等同；scope/ready/sha/seal 门禁保留 | `passed_schema_runtime` |
| G5-M6-08 | 完整门禁 | Shared 104、Server 551、env 33、file 4、DB 6、typecheck/Prisma/diff | `passed` |

### 8.4 必跑命令

实施中必须在根 scripts 提供并实际运行：

```bash
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm prisma:validate
corepack pnpm typecheck:e2e
corepack pnpm test:e2e
corepack pnpm test:e2e:repeat
corepack pnpm test:render
corepack pnpm test:migration:g5
```

`test:render` 必须固定 browser/font/renderer version 并输出 machine-readable diff；`test:migration:g5` 覆盖 fresh、G1～G4、legacy parsed/unresolved 和 rollback boundary。

### 8.5 Runtime/User 路径

| 路径 | 内容 | 必须产物 |
| --- | --- | --- |
| A | 分页漫画：四格、横排气泡、竖排拟声、reload、Revision、PNG/PDF | screenshot、PNG、PDF、manifest |
| B | 条漫：20 段、重排、手机预览、slices/长图 | screenshot、slices、拼接 diff |
| C | A→Layout/Publication→B→replace crop→新 Publication | 旧/新历史、impact/replacement evidence |
| D | 多标签冲突、server/worker 重启、迟到结果 | trace、task/attempt/current 查询 |
| E | 手机只读、AI preview/discard/apply/Undo | network trace、command evidence |

## 9. Review 判定

| 结论 | 含义 |
| --- | --- |
| `passed` | 所有本阶段 required 项真实运行通过，无 blocker |
| `passed_isolated` | 只证明临时根/fixture；不得替代真实环境结论 |
| `changes_required` | 至少一个 blocker 或 required 项失败 |
| `not_run` | 没有运行；不得描述为覆盖/完成 |
| `waiting_human_gate` | 工程证据已齐，只缺固定人工授权/签收 |

测试数量变化时记录新数量和原因，不以历史数量作为硬编码验收值。
