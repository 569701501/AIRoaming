---
doc_id: AIR-D2-A2-1-RUNTIME-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: A2-1 fresh SQLite integration evidence
---

# D2-A2-1 Runtime/User Review

reviewer_role: Runtime/User Review（临时根）  
reviewed_commit_or_diff: P1 implementation working tree  
scope_checked: fresh SQLite + temporary workspace, no real provider/data/credentials  

## 用户路径复核

- fresh 0001～0010 SQLite 部署后创建项目，Workbench 返回 `g2_db` 与 `scriptWorkingCopy=true`。
- metadata 更新、order=2 建章及 replay 成功；同进程立即可读。
- AI pending 创建、同命令 replay、采用/丢弃均通过；pending 不覆盖正式正文，adopt 不生成 ScriptVersion。
- Working Copy CAS 保存和 publish 通过；双重 publish/restart 证据来自既有 G2 集成链。
- outline draft/replay/expected-ID confirm 通过；stale ID 返回 `VERSION_NOT_FOUND`，current pointer 不被静默替换。
- 关闭并重新创建 Nest context 后，项目 metadata、章节、outline、Working/current 读取一致。
- 在临时 workspace 写入伪 `project.json` 后，DB Workbench 语义不变；业务写未创建 project tree。
- DB 旧 draft/complete/source-pending 入口由服务稳定拒绝；file-mode 原测试仍通过。

commands_and_results:
- `vitest run src/projects/project-db-persistence.integration.spec.ts`: 14/14 PASS
- `vitest run src/migration/project-chapter-shadow-importer.integration.spec.ts`: 58/58 PASS
- server 全量首轮：359/360；唯一失败为旧测试调用 legacy route，已迁移到 G2 API。

evidence_test_ids:
- `D2-A2-1: keeps metadata, chapter ensure, AI pending and outline commands replayable`
- `IMP-M4-API-01 rebuilds the public workbench DTO from a full DB shadow without touching legacy files`

findings: 临时根路径 PASS；没有网络 provider、真实数据库、默认 workspace、Keychain 或系统凭据访问。  
residual_risks: 真实切换前仍需完成 A2-2～A8、M6 tooling 与 C0～C7 临时演练；A2-1 不等于 production-ready。  
verdict: PASS
