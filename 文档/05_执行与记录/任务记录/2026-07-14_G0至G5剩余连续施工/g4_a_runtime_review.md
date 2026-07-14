---
doc_id: AIR-G4-A-RUNTIME-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G4-A fresh SQLite、legacy importer、应用构建与回归结果
---

# G4-A 运行复核

## 1. 结论

```text
phase = G4-A
result = passed_isolated
user_path = not_applicable_until_G4-C_E_F
```

G4-A 是契约、Schema overlay 和迁移阶段，没有对外开放新的返修 API 或完整页面交互，因此不伪造人工 UI 签收。隔离运行证据足以允许进入 G4-B；G4 总体 Runtime/User Review 仍保持 `not_run`。

## 2. 已真实运行的隔离路径

1. 在完整 0001～0011 fresh SQLite 上部署 0012，核验 index/trigger 精确清单、integrity 与 FK。
2. 执行 A→B→clear→A，核验四条线性 revision 和 current pointer。
3. 注入首条非法、同 previous 分叉、同 Candidate replace、非法 action transition、非 current next、pointer CAS 故障与当前 Candidate reject。
4. 运行 legacy Candidate/CandidateLock 导入：selected→favorite、locked 不推断 current、direct ready evidence 建 v1、staged Asset 阻断、同 snapshot replay。
5. 运行完整 16-slice final importer、fresh 双库一致性、tamper/secret/fail-closed、ready gate 与 DB API 重建回归。
6. 构建 Server 和 Web，确认当前页面仍可编译，并只从 Shot projection 派生“当前定稿”。

## 3. 未执行

- 未对真实用户数据执行 0012 migration 或候选返修写入。
- 未执行 G4 preview/commit API、影响弹窗、双窗口竞争、迟到任务或 G4 完整用户路径；这些接口尚属 G4-C～F。
- 未删除 backup/archive，未执行 down migration，未进入 G6/视频链路。
