---
doc_id: AIR-G3M1-PLAN-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent
source: G3-M 维护快照与运行态封口施工包
---

# 目标

在 G3-M0 `e2caa13` 上完成 sealed runtime bundle 与 workspace snapshot 的完整 M1 封口能力。

# 允许范围

- `apps/server/src/migration/**` 中 snapshot/runtime bundle/redactor/path guard
- `apps/server/src/maintenance/**` 必要的 bundle 文件校验/写入接线
- `db:snapshot` package script、SNP/runtime 测试、G3-M1 文档证据

# 禁止范围

- importer、migration decision codec、DB audit/import/verify
- backup/restore/activate、SecretStore 真实接入、G5
- 修改 G3 enum、Prisma migration 0010、活动 workspace 内容

# 验收标准

1. closed bundle 只能由已验证同一文件产生 snapshot。
2. pre/post source manifest 精确一致才写 `SEALED`。
3. 绝对路径、反斜杠、空段、`.`、`..`、NUL、symlink、socket/device 均拒绝。
4. settings 原文不进入 payload，未能安全脱敏的 secret fail-closed。
5. 两个绝对根的相同相对内容生成相同 source/snapshot digest。
6. snapshot 前后源 hash/mtime 不变，临时失败不留下 sealed 目录。

# 退出标准

- SNP-01～06 与 runtime bundle/redaction 测试通过。
- server typecheck、server 全量测试、G1 三项 check、git diff --check 通过。
- handoff、scrutiny_review、runtime_user_review 和 evidence 已更新。
