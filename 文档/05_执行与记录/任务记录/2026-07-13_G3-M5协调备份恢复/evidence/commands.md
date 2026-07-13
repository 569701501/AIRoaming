---
doc_id: AIR-G3-M5-DOC-EVIDENCE-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: M4 current-HEAD acceptance rerun and M5 document readiness review
---

# M4 验收与 M5 文档就绪证据

## M4 当前 HEAD 复跑

- 审查 HEAD：`65c90fe`。
- server 全量：47 个测试文件、303 tests 通过。
- migration integration：58/58 通过。
- workspace typecheck、G1 manifest/schema/migration check、Prisma validate、`git diff --check` 全部通过。
- G1 manifest digest：`sha256:ad3b0e1ba884e20718e6e81994cbb8beaedbb9e6777e471ac2a21e4c94c2b1ea`。
- `0c3295b..65c90fe` 没有修改 `apps/server/prisma/schema.prisma` 或 `apps/server/prisma/migrations/**`。
- M4 实现提交：`4972d8e`；证据提交：`c040a1a`、`4c2d7aa`、`006c5cd`；旧截图删除为用户单独授权提交 `65c90fe`。

## M5 文档就绪检查

- 只变更文档；`apps/server`、`apps/web`、`packages`、`tests`、Prisma Schema 和 migration tree 无 diff。
- M5-A0～A3 分片、允许/禁止路径、CLI 参数、稳定错误、验收 ID、Stop condition 和退出证据已齐。
- coordinated backup 必须验证 full-shadow artifact 中正好 16 个有序 succeeded slice、nested report/ledger 和统一 source/snapshot/decisions 身份；单个 run 不足以进入备份。
- `pre-cutover`、final import、SecretStore、required capability closure 和 M6 activate 继续 fail-closed。
- M4 verification JSON 可解析；全部文档通过 `git diff --check`。

## 结论

M4 正式通过；M5 文档状态为 `ready_for_development`。Luna 当前只能从 M5-A0 开始，不得同时领取 A1～A3。
