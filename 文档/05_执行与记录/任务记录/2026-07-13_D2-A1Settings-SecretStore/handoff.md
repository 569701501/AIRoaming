---
doc_id: AIR-D2-A1-HANDOFF-001
status: completed
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: D2 路线、D74 修正版 A、G1 SecretStore 契约、D2-A0
---

# D2-A1 Settings + SecretStore 交接

## 1. 本切片边界

本切片只处理设置与凭据边界：

- 非秘密设置 metadata：`AppPreference`、`ProviderConfig`、`CredentialMetadata`。
- 图片凭据：后端 `SecretStore` 契约、测试 fake adapter、运行时读取。
- 文本凭据：OpenCode 是权威存储；AI漫游设置文件/DB 只保留配置状态、fingerprint 和 provider metadata，运行时只在当前进程短暂持有用户刚提交的 key。
- 旧 `app-settings.json` 的图片 key 只允许在临时测试根迁入 fake store 后被原子脱敏；没有 SecretStore 时必须 fail-closed。

禁止：

- 真实 macOS Keychain、Windows Credential Locker、Linux Secret Service 的读写；本切片只保留 adapter seam 和 unavailable fail-closed 实现。
- 真实 workspace、真实数据库、真实系统凭据库、真实 provider 请求。
- D2-A2 项目/章节/剧本公开写、D2-A6 Outbox consumer、D2-A7 final importer、M6 activate。

## 2. 当前问题

`SettingsService` 目前把四类 `apiKey` 写入 `workspace/settings/app-settings.json`，`ImageProviderService` 直接从 SettingsService 读取图片明文。前端还展示 `keyPreview`。这与 D74 修正版 A 冲突：图片 key 必须只进后端 SecretStore，文本 key 只交给 OpenCode auth。

## 3. 交付目标

1. `SecretString` 不可通过 `toString/toJSON/inspect` 泄漏；只有显式 `reveal()` 可在 provider 边界短暂取得值。
2. `SecretStore` 具备 `put/get/delete/probe`；fake adapter 只在 `AIROAMING_SECRET_STORE_ADAPTER=fake` 且有显式 fake root 时可用，默认 adapter 不可用时明确报错。
3. SettingsService 永不把图片 key 写入 JSON；旧明文迁移没有 fake/真实 adapter 时拒绝启动/写入，不回退普通 JSON。
4. `GET /settings`、日志、task/artifact、DB metadata 和 settings JSON 不返回图片 key 或 `keyPreview`。
5. 图片 provider 读取只经过 SecretStore；provider 不再把图片 key 当成 settings 文件事实源。
6. DB 模式写入 `ProviderConfig/CredentialMetadata/AppPreference`，但不写 secret 明文；file 模式保留非秘密 settings 兼容文件。

## 4. 完成定义

- [x] SEC-01～SEC-09、SEC-11 定向测试通过；SEC-10 因本切片无 task/artifact/log 写入路径记为 N/A。
- [x] fake store 经过 put/get/replace/delete/restart 读取证据。
- [x] 旧 settings 图片 key 迁入 fake store 后 sentinel=0；无 store/不安全 root 时旧文件字节不变。
- [x] API DTO 的四类 provider 均只返回 `configured/fingerprint/updatedAt`，`keyPreview=null`。
- [x] DB metadata 重启可读；`CredentialMetadata.secretRef` 是唯一图片凭据引用。
- [x] 默认无 SecretStore 时，配置图片 key 返回稳定错误，不生成明文 JSON。
- [x] 未触碰 D2-A2 及 M6。
