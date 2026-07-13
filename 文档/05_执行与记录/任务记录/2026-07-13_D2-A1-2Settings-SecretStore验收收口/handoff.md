---
doc_id: AIR-D2-A1-2-HANDOFF-001
status: ready_for_luna
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2-A1 首切片、D2 进度复核、G1 SecretStore 契约
---

# D2-A1-2 Settings + SecretStore 验收收口交接

## 当前基线

- 上一个实现提交：`fd5c369 feat(settings): add secret store boundary`。
- 现有定向基础测试可通过，但 capability registry 仍把 `settings_credential_secret_store` 标为 unsupported。
- 现有 fake/unavailable store 不是生产 adapter；settings file 写入仍需原子化。

## 必须交付

### 1. macOS Keychain adapter

- 新增 `MacOSKeychainSecretStore`，通过 `security` 命令或等价受维护 API 实现 `put/get/delete/probe`。
- `CommandExecutor` 必须可注入；测试只用 fake executor，断言参数、退出码、stdout/stderr 脱敏，不运行真实 Keychain。
- 非 macOS 或 adapter 不可用必须返回稳定 unavailable 错误，不能回退 JSON。
- secretRef/fingerprint 只写 metadata；不得提供列出所有明文的 API。

### 2. settings 原子脱敏

- 抽出可测试 `writeSettingsFileAtomically`：同目录临时文件、0600、写入后 fsync、rename 替换，必要时同步目录。
- 旧 legacy 图片 key 迁移必须先 put/get/fingerprint 校验，再原子写 sanitized settings。
- store、写入、fsync 或 rename 失败：旧文件字节完全不变；临时文件和明文副本清理。

### 3. redactor 与 SEC-10

- 扩展现有 `credential-redactor.ts`，统一递归处理对象、数组、Buffer/Uint8Array 和文本 sentinel；不在错误消息回显 sentinel。
- 复用/收口 backup/restore 中重复 sentinel 逻辑，避免不同规则漂移。
- 测试 fixture 必须分别覆盖 DB、settings、migration report、log、task payload/artifact、export 文件；任何命中都 fail-closed，干净 fixture 返回 0。

### 4. capability registry

- 只更新 `settings_credential_secret_store`：implemented、restartCovered=true、稳定 evidenceTestIds、准确 blocker=null。
- 不修改其他 7 个 capability 的状态；`db:capabilities --check` 仍应退出 2，但 blockedIds 只剩 6 个。

## 禁止越界

不实现 D2-A2、D2-A6 Outbox consumer、final importer、M6、真实数据迁移、真实系统 Keychain 测试。

## 交付方式

完成后更新 progress/findings/review docs，独立 commit；先停下交 Scrutiny Review，不自动领取 D2-A2。
