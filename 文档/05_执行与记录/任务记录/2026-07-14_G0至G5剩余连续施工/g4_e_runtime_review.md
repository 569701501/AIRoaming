---
doc_id: AIR-G4-E-RUNTIME-001
status: completed
created: 2026-07-15
updated: 2026-07-15
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: 临时 DB-only E2E、公开 HTTP API、真实浏览器与 loopback fake provider 运行结果
---

# G4-E 运行复核

## 1. 结论

```text
phase = G4-E
result = passed
browser_ui = passed
db_only_public_path = passed
concurrent_repreview_without_commit = passed
overall_g4 = pending_G4-F
```

## 2. 已运行路径

1. fresh 临时 SQLite 经公开 Script→Story→Storyboard→Preflight→image task 路径生成 3 个 Candidate；后台 Worker 与 loopback fake provider 正常完成任务。
2. 浏览器完成 favorite、reject、restore，Server/Workbench 状态与页面同步。
3. 首次 lock 先显示影响清单，用户确认后产生 current revision；随后可完成候选阶段并创建 Layout/Export。
4. 第二窗口通过公开 API 并发 replace；第一窗口提交旧确认得到 409，页面自动重新 preview 并明确提示重新确认，数据库 current 保持第二窗口结果，证明没有自动 commit。
5. 用户第二次显式确认后 replace 成功；历史面板可查看 v1/v2/v3 线性 revision。
6. 排版页显示 stale 来源摘要，旧 Layout/Export 仍保留，新导出入口禁用。
7. clear 仍经 preview/confirm；提交后 incomplete gate 生效，不能继续正式布局/导出。

## 3. 运行证据

- Playwright DB-only `candidate-decision-workbench.spec.ts`：1/1，通过。
- 测试使用临时数据库和临时素材目录；未使用真实目标数据库业务数据、真实凭据或外网 provider。
- 成功用例按 E2E 配置不保留 failure-only screenshot/trace；真实浏览器交互、公开 HTTP 请求和最终 DB authority 断言均由自动化记录。
- E2E 环境支持测试 31/31，通过；Web build 与 E2E typecheck 通过。

## 4. 未执行与边界

- migration 冲突/unresolved、完整 A→B→clear→A、backup restore 和总体 G4 restart 仍由 G4-F 执行。
- 未在真实目标数据库制造 Candidate 返修业务数据。
- 未删除 backup/archive，未执行 down migration、file-only 回退或 G6/视频链路。
