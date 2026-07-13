---
doc_id: AIR-D2-A2-1-REVIEW-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A2-1 Handoff、实施契约、测试矩阵
---

# D2-A2-1 复核清单

## 1. 复核角色与顺序

实现者提交候选代码后停止。复核按以下顺序进行：

1. **Scrutiny Review**：只读代码、diff、契约、测试和 capability 证据，不补实现。
2. **Runtime/User Review**：只在测试临时根运行公开 Service/API/Web 路径，不使用真实数据或 provider。
3. 两者都 PASS 后，才允许写功能完成记录和独立 commit。

同一个 AI 可以分角色执行，但 `scrutiny_review.md` 与 `runtime_review.md` 必须分开，且 reviewer 不能把自己临时修代码的结果直接判 PASS；发现问题应退回 Worker 修复后重新复核。

## 2. Scrutiny Review

### 2.1 范围

- [ ] diff 只覆盖 A2-1 文件地图允许范围。
- [ ] 没有 schema/migration/G1 generator/trigger 变更。
- [ ] 没有 clear/import/reset、A3、Outbox、final importer、M6 实现。
- [ ] 没有真实根、真实 provider、真实 Keychain 或凭据痕迹。

### 2.2 架构

- [ ] DB 写集中在 `ProjectScriptCommandRepository`，没有在 controller/Pinia 直写 Prisma。
- [ ] 未新增整棵 LocalProject diff/全量 upsert 通道。
- [ ] 多表写使用 `VersionTransactionRunner`，异常能整事务回滚。
- [ ] runtime stable ID 不依赖 migration ledger，不含时间戳/随机数。
- [ ] identity-map refresh 是应用服务一致性步骤，不靠重启解决。

### 2.3 metadata / Chapter

- [ ] DB metadata 只改 5 个允许字段；comicFormat/lifecycle/pointer 不可变。
- [ ] 显式 `sourceText` 无论空/同值都被拒绝，replacement 正确，DB 零写。
- [ ] ensure 使用请求 order，不调用“取 next order”偷换语义。
- [ ] 同 order replay 不改标题；并发只产生一章。
- [ ] Chapter create 与 Project pointer 在同事务。

### 2.4 AI pending

- [ ] pending 写入前正规化 text/digest，并限制 2 MiB。
- [ ] 创建 pending 不改变 Working/current/ScriptVersion/下游历史/Chapter title。
- [ ] 同命令重放返回相同 pending/revision；不同 digest 和 active pending 冲突正确。
- [ ] revision 与 last pointer 同事务；targetWorkingDigest 正确。
- [ ] 缺失 Conversation FK 使用 null，不伪造行、不写空字符串。
- [ ] 批量每章 child toolCallId 稳定且唯一。
- [ ] adopt 只写 Working Copy；discard 不写 Working；二者都不创建 ScriptVersion。

### 2.5 Outline

- [ ] save 是 append-only 新 draft/semantic replay，不覆盖 confirmed 正文。
- [ ] current pointer 是唯一选择依据，不按 updatedAt 猜 current。
- [ ] confirm 必须携带 expected outline ID。
- [ ] stale expected ID 返回冲突，不会确认后来生成的另一份大纲。
- [ ] 旧 confirmed 只转 archived；formal 内容字段字节不变。

### 2.6 Web / API

- [ ] Workbench capability 来自真实 persistence mode。
- [ ] file mode 仍走旧 API，DB mode 才走 G2 API。
- [ ] Web 在开始编辑/切章时保存 observed rowVersion/digest/IDs。
- [ ] 点击时没有 pre-read latest 再提交的绕 CAS 逻辑。
- [ ] dirty publish 先 update Working，再用 response publish。
- [ ] 409 不自动重试、不覆盖；用户得到明确冲突提示。
- [ ] 四条旧 DB route 均稳定 409 + replacement；file mode 不回归。

### 2.7 capability

- [ ] 只有 5 个目标 operation 状态/evidence 改变。
- [ ] evidence 指向实际运行、稳定命名的测试，而非文档占位符。
- [ ] 操作 registry 与源码 gate 集合仍完全相等。
- [ ] 两个聚合 capability 仍 partial。
- [ ] `blockedIds` 精确为 6，其他 capability 深比较不变。

## 3. Runtime/User Review

### 3.1 安全准备

- [ ] `mkdtemp` 创建 data/workspace 根并写测试 marker。
- [ ] SQLite 使用 fresh file，部署正式 0001～0010。
- [ ] 环境明确设置 `AIROAMING_PERSISTENCE_MODE=db`、临时 `DATABASE_URL`、临时 workspace/data root。
- [ ] provider 使用 fake；不触碰默认根或网络 provider。
- [ ] 清理前核对 marker/root，禁止宽泛递归删除。

### 3.2 用户链路

- [ ] 创建项目，Workbench 显示 `g2_db/scriptWorkingCopy=true`。
- [ ] 更新项目名称/题材/描述后同进程立即可见。
- [ ] AI 生成待采用稿后，右侧出现 pending，正式正文仍不变。
- [ ] 采用后编辑器显示 Working Copy；历史版本数量仍不变。
- [ ] Publish 后才出现新 ScriptVersion。
- [ ] 第二个 pending 丢弃后 Working/current 保持不变。
- [ ] 生成 outline A、再生成 outline B 后确认 A 会提示冲突；确认 B 成功。
- [ ] 双客户端旧 rowVersion 保存冲突，不自动覆盖。

### 3.3 restart / isolation

- [ ] mutation 后不重启即读取 Workbench，数据正确。
- [ ] 关闭并重新创建 Nest context，Working/current/pending/history/outline 一致。
- [ ] 在临时 workspace 写同 projectId 的伪 `project.json`、chapter/pending/outline 文件。
- [ ] 伪文件不改变同进程或 reopen 后的 DB DTO。
- [ ] 业务写本身没有创建 workspace project tree。

### 3.4 旧模式

- [ ] DB 模式旧 draft/complete/source-pending 入口 409，错误详情可供 Web 判断。
- [ ] 单独启动 file mode fixture，原保存/完成/采用/丢弃仍通过。
- [ ] file mode 的 G2 新 mutation 仍 fail-closed。

## 4. 必跑门禁

- [ ] Targeted shared/server tests 全绿。
- [ ] Server 全量测试 0 failed。
- [ ] Workspace typecheck 全绿。
- [ ] Web build 全绿。
- [ ] Prisma validate 全绿。
- [ ] G1 manifest/schema/migration check 全绿。
- [ ] capability report 可输出；check 按预期退出 2，blockedIds=6。
- [ ] `git diff --check` 全绿。
- [ ] `git status --short` 只含本切片预期文件。

## 5. 复核结论模板

`scrutiny_review.md` 和 `runtime_review.md` 必须分别写：

```text
reviewer_role:
reviewed_commit_or_diff:
scope_checked:
commands_and_results:
evidence_test_ids:
findings:
residual_risks:
verdict: PASS | CHANGES_REQUIRED | FAIL
```

只有零 P0/P1、没有未解释 P2、所有强制证据齐全时才能 PASS。

## 6. 通过后的停止线

PASS 后只允许：

1. 更新 progress/findings。
2. 新增 A2-1 功能完成记录。
3. 独立提交 A2-1。
4. 向用户报告结果并停止。

不得在同一提交或同一轮继续：

```text
D2-A2-2 clear/import/reset
D2-A3
D2-A6 Outbox
final importer
D3 / M6
真实数据、真实 provider、真实凭据操作
```
