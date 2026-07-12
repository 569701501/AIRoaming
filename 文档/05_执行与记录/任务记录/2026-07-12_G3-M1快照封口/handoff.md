---
doc_id: AIR-G3M1-HANDOFF-001
status: active
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G3-M1 实现与验收
---

# Handoff

## 已完成

- `RuntimeBundleFileService`：校验 schema/kind/payloadDigest、拒绝 symlink/非 0600/secret，并支持 0600 临时文件 + fsync + 原子 rename。
- `SnapshotService`：显式绝对 workspace/staging/runtime-bundle 参数；拒绝 staging 越界、非空 staging、symlink、socket/device、危险 storageKey。
- pre/post source manifest 精确比较；源变更时清理临时目录并返回 `SNAPSHOT_SOURCE_CHANGED`。
- settings 原文不进入 snapshot；已知 credential 字段统一 `[REDACTED]`，常见未知 token 命中返回 `SNAPSHOT_SECRET_DETECTED`。
- 输出包含 `source-manifest.json`、`snapshot-manifest.json`、`transforms.json`、`settings.redacted.json`、`runtime-bundle.json`、`payload/`、`SEALED`。
- `db:snapshot --workspace-root --staging-root --runtime-bundle --format json` 已提供；成功输出只含稳定 code 和 digest，不输出物理根。

## 后续阻塞

- M2 decision codec/issue ledger 尚未实现；M1 sealed snapshot 不可直接导入。
- M3 importer、M4 verifier/shadow、M5 backup、M6 activate/SecretStore 仍未开始。
- redactor 目前是 M1 的已知 credential/常见 token 规则，不是完整 SecretStore。

## 验证

见 `evidence/commands.md`；M1 基线为 `e2caa13`。

