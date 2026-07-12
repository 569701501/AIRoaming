---
doc_id: AIR-REVIEW-20260712-G3M-DOC-SCRUTINY
status: passed_with_release_blockers
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-M 五份施工资料与当前代码只读对照
---

# Scrutiny Review

## 结论

文档对 G3-M foundation 开发为 passed；对 production activate 为 blocked_by_prerequisites。两个结论必须同时保留。

## 已通过

- G3-M 被准确界定为 G1 M2～M4 runtime + G3 decision plugin，不再伪装成小型 mapper。
- M0～M6 的前置、文件面、状态机、CLI、错误、测试和 Stop condition 已冻结。
- four_panel/missing/invalid 使用三个具体 issue code，决议 artifact 与 sourceManifestDigest/sourceDigest 绑定。
- MigrationRun terminal 不可变、旧 issue 不覆盖、final succeeded 与 PersistenceState 激活身份一致。
- backup 明确为 offline coordinated，restore 只进空根，Secret 不进入 bundle。
- capability registry 非零时 final/activate fail-closed；第一任务只允许 M0。

## 发布 blocker

- 当前 DB runtime required capability 未全覆盖。
- MaintenanceCoordinator、snapshot、runtime bundle、importer、SecretStore、backup/restore、activate CLI 均未实现。
- 未取得真实停写/切换授权，也未执行真实 workspace rollout。

## 静态检查

- 五份文档存在且 frontmatter/标题/代码围栏完整。
- README 与 AI 上下文入口已建立双施工包索引。
- G3 主方案、迁移字典、G1/G3 验收中的状态和 issue code 已同步。
- git diff --check 通过。
