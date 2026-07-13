---
doc_id: AIR-D2-M6-MASTER-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: developer, qa, ai-agent
source: G1 验收 ID、D2 施工资料与 M6 C0～C7
---

# D2 至 M6 连续交付测试矩阵

> 本矩阵保留各历史阶段的基线数字；当前真实 capability 以 CLI 为准，应为 8/36/`blockedIds=[]`。D2-A7 及以后证据以 `luna_execute_all_remaining.md` 的 FIN/ACT/RB 门为准。

## 1. 执行层级

| 层级 | 频率 | 内容 |
| --- | --- | --- |
| L1 定向 | 每次实现循环 | 当前 repository/service/CLI 的 unit/integration |
| L2 阶段回归 | 每阶段提交前 | server 全量、workspace typecheck、G1/Prisma、diff |
| L3 聚合回归 | D2-A6、D2-A8、M6 收口 | root test:all、E2E、fresh/replay/secret scan |
| L4 真实运行 | 仅另行授权后 | 真实 C0～C7、Runtime/User Review |

## 2. 通用命令

每阶段提交前至少：

```bash
corepack pnpm --filter @airoaming/server test
corepack pnpm -w typecheck
corepack pnpm --filter @airoaming/server g1:manifest:check
corepack pnpm --filter @airoaming/server g1:schema:check
corepack pnpm --filter @airoaming/server g1:migration:check
DATABASE_URL=file:<explicit-temp-db> corepack pnpm --filter @airoaming/server prisma:validate
git diff --check
```

若 package script 对参数不接受字面 `--`，按现有 CLI 契约直接传参数；测试必须覆盖真实 script 入口。

聚合门：

```bash
corepack pnpm test:all
corepack pnpm typecheck:e2e
corepack pnpm test:e2e:env
corepack pnpm test:e2e:prepare
corepack pnpm test:e2e
```

## 3. P0 基线

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| MASTER-BASE-01 | capability report | 当前基线 8 capabilities、36 operations、blockedIds 精确 2；历史阶段基线见各阶段小节 |
| MASTER-BASE-02 | final fail-closed | `MIGRATION_FINAL_IMPORT_NOT_READY`，Prisma/目标零副作用 |
| MASTER-BASE-03 | activate absent | package script 与 CLI 均未冒充已实现 |
| MASTER-BASE-04 | roots | 所有 fixture 根均为唯一临时路径，无默认根访问 |

## 4. P1 D2-A2-1

详细测试以既有 `D2-A2-1/test_matrix.md` 为准，至少覆盖：

- metadata no-op/CAS/unknown/sourceText rejection。
- ensure chapter 幂等/并发/order 校验。
- AI pending create/replay/conflict/adopt/discard。
- pending 不创建 ScriptVersion；publish 才创建。
- Outline append/confirm/expected-id conflict。
- Web file/db 双模式和 409 不覆盖。
- 同进程 refresh、Nest restart、legacy mutation isolation。
- operation evidence 5 项；blockedIds 仍为 6。

## 5. P2 D2-A2-2

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| A2-2-01 | Working Copy clear | observed CAS；formal ScriptVersion/current 下游不删除 |
| A2-2-02 | 旧 pending confirm/discard | 稳定 retired code/replacement；新 adopt/discard 成功 |
| A2-2-03 | 内部 clear dirs | DB mode 零文件副作用；file mode 回归不变 |
| A2-2-04 | import preview | 返回受影响章节/历史/任务/下游摘要，确认前零写 |
| A2-2-05 | safe import | 单事务、幂等、历史不覆盖、restart 一致 |
| A2-2-06 | reset | 不物理删历史、不回退 milestone；危险情形稳定拒绝并给 replacement |
| A2-2-07 | retired registry | 每个 retired 都有 reason/replacement/rejection+success evidence |
| A2-2-08 | aggregate | project capability 绿，blockedIds=5，其他项不变 |

## 6. P3 Story/Storyboard/Preflight

复用 G1/G2：

- DOC-01～09 中适用项。
- REP-05～07、REP-10～12。
- G2 Story/Storyboard pending/current/CAS/freshness 测试。

新增至少：

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| A3-DOC-01 | document/projection/current | 任一点失败整事务回滚 |
| A3-DOC-02 | confirmed update | 新版本，旧 document bytes/fields 不变 |
| A3-DOC-03 | stale cascade | 上游更新只改 applicability/current，不删历史 |
| A3-PRE-01 | fake ready | 客户端 ready/source 伪造被拒 |
| A3-PRE-02 | character resolve CAS | observed revision/source，重放幂等 |
| A3-RESTART-01 | reopen | pending/current/projection/ready 与 API 一致 |
| A3-CAP-01 | aggregate | outline/story capability 绿，blockedIds=4 |

## 7. P4/P5 Character/Asset/Lock

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| A3-CHAR-01 | extract/upsert | name identity 稳定，不建第二角色事实源 |
| A3-CHAR-02 | preview/final queue | Task 先落 DB，source frozen，fake provider |
| A3-ASSET-01 | staged→ready | bytes/hash/MIME/dimensions 与 DB 一致 |
| A3-ASSET-02 | promote crash/replay | 不重复文件/Asset/Visual，旧 token 无效 |
| A3-VIS-01 | replace visual | 新版本；被 Candidate 使用的旧版本不覆盖 |
| A3-VIS-02 | delete reference | current 安全切换，历史引用不破坏，物理删除走 Outbox |
| A3-LOCK-01 | lock scope | Shot/Candidate/Task/Asset 同 scope |
| A3-LOCK-02 | replace/late result | 新 lock revision；迟到只 historical |
| A3-IMG-01 | complete images | 全 required Shot fresh/ready 才推进 |
| A3-RESTART-02 | reopen/isolation | DB DTO 一致，旧 characters/assets/candidates JSON mutation 无效 |
| A3-CAP-02 | aggregate | character capability 绿，blockedIds=3 |

## 8. P6 Layout/Export

必须逐项关闭：

- LAY-01～06。
- EXP-01～06。

另加：

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| A4-LAY-RESTART | reopen | WC/Revision/Binding/current 一致 |
| A4-LAY-STALE | lock replace | 旧 layout 不改，source applicability stale |
| A4-EXP-FAIL | renderer/file fail | Export 非 ready，无 current，无半成品公开 |
| A4-EXP-REPLAY | response lost | postcondition 后不重复 artifact/files |
| A4-PKG-DB | asset package | 不读旧业务 JSON/Markdown；manifest 全部 DB provenance |
| A4-SECRET | export scan | manifest/log/artifact sentinel=0 |
| A4-CAP | aggregate | layout capability 绿，blockedIds=2 |

## 9. P7 Dialogue（已完成）

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| REP-08 | send/tool restart | thread/message/tool result 持久 |
| REP-09 | kill running | 重启 interrupted/failed，不永久 running |
| DLG-01 | provider 前落库 | user+assistant running 已提交，失败可见 |
| DLG-02 | pending restart | Script/Outline/Story/Storyboard pending 可继续处理 |
| DLG-03 | tool replay | 相同 toolCall 不重复正式副作用 |
| DLG-04 | stream disconnect | DB 状态收敛，临时 stream state 清理 |
| DLG-05 | maintenance/delete | draining/closed/deleting 阻断新消息 |
| DLG-06 | secret | provider error/log/message meta sentinel=0 |
| DLG-CAP | aggregate | dialogue capability 绿；当前总 blockedIds=2（Character delete、Project delete/Outbox） |

## 10. P8 Outbox/Delete

必须：

- OTB-01～05。
- DEL-00～05。
- SEC-04/05/11 的旧 secret ref 清理。

新增真实临时目录故障注入：

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| OTB-FS-01 | rename 前崩溃 | intent 可恢复，未公开半成品 |
| OTB-FS-02 | rename 后响应丢失 | probe 识别完成，不重复动作 |
| OTB-FS-03 | symlink/path escape | fail-closed，根外字节不变 |
| DEL-RUN-01 | delete request 后杀进程 | deleting+event 保留，重启继续 |
| DEL-RUN-02 | late task/provider | 不能重建目录、Asset/current |
| DEL-RUN-03 | two projects | 只清目标项目，另一项目字节/DB 不变 |
| D2-CAP-00 | final registry | blockedIds=[]，`--check` exit 0 |

## 11. P9 final importer

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| FIN-01 | 16-slice final | 一个权威 succeeded final run，slice order/count 完整 |
| FIN-02 | blocked slice | final blocked/fail-fast，ready 不写 |
| FIN-03 | same identity replay | 零新增、report/inventory 稳定 |
| FIN-04 | different identity | 冲突拒绝，不覆盖旧 final |
| FIN-05 | non-empty target | 副作用前拒绝 |
| FIN-06 | report/decision tamper | digest mismatch，ready 不写 |
| FIN-07 | secret prestage fail | settings 原字节不变，无 plaintext copy |
| FIN-08 | verify | integrity/FK/ledger/source/current/Asset/API 全绿 |
| FIN-09 | ready shape | state identity 匹配、activated/firstWrite null |
| FIN-10 | capability regression | blocker 非零时 final 在 DB 初始化前拒绝 |

## 12. P10 D2 综合见证

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| D2-WIT-01 | fresh A/B | entity/report/inventory 规范化一致 |
| D2-WIT-02 | replay | 零新增、历史 bytes/fields 不变 |
| WIT-01 | 正式 importer→DB reopen | 七阶段已实现 DTO/状态/Asset/Dialogue/Task 一致 |
| D2-WIT-03 | old metadata mutation | API 不变、DB 写不改 archive |
| D2-WIT-04 | secret scan | DB/workspace/report/log/task/artifact/export 0 命中 |
| D2-WIT-05 | capability | 8 聚合项、36 操作闭合、blockedIds=[] |

## 13. P11 M6

必须：

- ACT-01～09。
- RB-01～06。
- RST-01～03 及 M5 已有全部 backup/restore 回归。

隔离 E2E：

| ID | 场景 | 通过条件 |
| --- | --- | --- |
| M6-C0 | release/file bridge | effective identity、capability、commit、marker 全匹配 |
| M6-C1 | drain/close | 同 PID、active=0、runtime bundle sealed |
| M6-C2 | snapshot/restore | source 不变、恢复空根、API/Asset 一致 |
| M6-C3 | fresh DB/secret | fake store prestage 可读，普通字节无 secret |
| M6-C4 | final/ready | final succeeded、verify、plaintext removal、ready |
| M6-C5 | DB maintenance | read/API/rollback smoke，firstWrite null |
| M6-C6 | archive | metadata-only；Asset path/bytes 保留可读 |
| M6-C7 | activate/reopen | activatedAt 写入，首业务写同事务写 firstWrite |
| M6-RB-A | C4 前失败 | file fixture reopen |
| M6-RB-B | ready/firstWrite null | snapshot/runtime rollback |
| M6-RB-C | db_only/firstWrite null | sealed backup restore |
| M6-RB-D | firstWrite 非空 | file-only 明确拒绝 |

## 14. Review 判定

每阶段 review 只需回答：

- 范围是否只在当前阶段。
- 公开路径是否真实走 DB/Outbox。
- 状态、CAS、事务、restart、replay 是否完整。
- 旧 metadata 是否已隔离。
- secret/path/错误是否安全。
- capability 是否由测试证据驱动。
- 是否有 P0/P1 或未解释跳过项。

任何 P0/P1、失败测试、真实根访问或 capability 数字漂移，阶段不得提交为 passed。
