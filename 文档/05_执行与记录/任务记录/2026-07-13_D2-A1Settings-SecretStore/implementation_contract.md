---
doc_id: AIR-D2-A1-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 SecretStore 详细契约、D74 修正版 A
---

# D2-A1 实施契约

## 1. SecretStore

```ts
interface SecretStore {
  put(input: { credentialId: string; secret: SecretString }): Promise<SecretMetadata>;
  get(credentialId: string): Promise<SecretString>;
  delete(credentialId: string): Promise<void>;
  probe(): Promise<CredentialStoreHealth>;
}
```

`SecretMetadata` 只包含 `credentialId/secretRef/fingerprint/configured/updatedAt`。不得存在列出全部明文的 API。

`SecretString` 的 `toString()`、`toJSON()`、`inspect()` 必须返回 `[REDACTED]`；provider 通过 `reveal()` 取得一次性字符串，调用完成后不得写入 DTO、task、artifact 或日志。

## 2. adapter 选择

| 环境 | 行为 |
| --- | --- |
| `AIROAMING_SECRET_STORE_ADAPTER=fake` + `AIROAMING_FAKE_SECRET_STORE_ROOT` | 仅测试 fake store；root 必须是显式临时目录，文件权限 0600，拒绝 symlink/目录穿越 |
| 未配置或 `unavailable` | `probe` 返回 unavailable；put/get/delete 抛稳定 `SECRET_STORE_UNAVAILABLE` |
| 真实系统 adapter | 本切片不实现；不得偷偷回退 JSON |

## 3. settings 持久化

- 文件 settings 只能保存 provider metadata、非秘密偏好、secretRef、fingerprint、configured/status。
- 图片旧 `apiKey`：先 `SecretStore.put` 并读取校验 fingerprint，再写 sanitized 临时文件并 rename；任一步失败，旧文件保持原状且不生成明文副本。
- 文本旧 `apiKey`：只放进当前进程内存供 OpenCode auth 同步；文件/DB 写入 configured/fingerprint/provider metadata，不复制到 AI漫游持久化事实源。
- 公共设置响应的 `keyPreview` 固定为 `null`；前端不得依据 preview 判断配置，只看 configured/fingerprint。

## 4. DB metadata

- `ProviderConfig.providerId` 是不可变身份；provider 切换新建配置，不原地改身份。
- 图片 `CredentialMetadata.owner=image_secret_store`；文本 `owner=opencode`。
- 图片配置成功：`status=configured, configured=1, secretRef!=null, fingerprint!=null`。
- 图片清除：本切片只实现 store 删除与 metadata 清空的测试 fake 事务边界；正式 `secret.delete_old_ref` Outbox consumer 属于 D2-A6，不能伪装成已完成。
- `AppPreference` 只存 theme、active image provider、default text provider/model。

## 5. 错误与回滚

- 无 SecretStore：`SECRET_STORE_UNAVAILABLE`。
- fake root 不安全：`SECRET_STORE_ROOT_UNSAFE`。
- secret 缺失：`SECRET_STORE_ENTRY_MISSING`。
- 旧明文清理失败：`SETTINGS_SECRET_MIGRATION_FAILED`，旧文件不被覆盖。
- 禁止 catch 后继续写 plaintext 或回退环境变量到 JSON。
