---
doc_id: AIR-G3M1-SCRUTINY-001
status: completed
created: 2026-07-12
updated: 2026-07-12
owner: AI漫游项目
audience: human, ai-agent, qa
source: G3-M1 静态复核
---

# Scrutiny Review

结论：M1 范围通过；可以把 sealed snapshot 交给 M2/M3，但不能把它当作已导入数据库。

- snapshot 只读取 sealed runtime bundle 与显式 workspace；不触碰 importer、Prisma、真实业务 workspace。
- sourceManifestDigest、snapshotManifestDigest、transformDigest、runtimeBundleDigest 各自独立，均排除绝对根和时间。
- pre/post source manifest 不一致时临时目录被删除，不写 `SEALED`。
- settings 原文只参与 source manifest，不进入 payload；脱敏失败和常见 token 命中 fail-closed。
- path guard 通过 `lstat` 拒绝 symlink、socket/device，并拒绝危险 storageKey；源文件 bytes/mtime 测试保持不变。
- M1 已知风险：redactor 尚不是 SecretStore；运行 bundle participant 的内存态仍由 M0 的 `unobservableBeforeBridge` 诚实描述；未知秘密检测不是通用熵分析。

