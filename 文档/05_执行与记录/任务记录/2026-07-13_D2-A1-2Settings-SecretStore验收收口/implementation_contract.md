---
doc_id: AIR-D2-A1-2-CONTRACT-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: G1 SecretStore 详细契约、D2-A1 实施契约
---

# D2-A1-2 实施契约

## Adapter

```ts
interface SecretCommandExecutor {
  run(file: string, args: readonly string[]): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }>;
}
```

- `MacOSKeychainSecretStore` 只在 `process.platform === "darwin"` 且 probe 成功时可用。
- `security` 命令返回的 secret 只在 adapter 内短暂存在；日志和错误只允许稳定 code，不允许 stdout/stderr 原文。
- fake executor 测试覆盖成功、missing、permission、non-zero exit、probe unavailable。

## 原子文件写入

- temp 文件必须与目标同目录，权限 0600，随机名不可预测。
- 写完整内容后 `FileHandle.sync()`，关闭后 rename；rename 前旧文件保持不变。
- 任一步失败清理 temp；不得 catch 后回退直接 `writeFile(target)`。

## Redactor/Sentinel

- key 名命中 `apiKey/api_key/token/accessToken/authorization/cookie/password/secret/credential/privateKey` 时递归替换 `[REDACTED]`。
- Buffer、Uint8Array、字符串、嵌套数组和对象都参与 sentinel 扫描。
- sentinel 命中只抛稳定 `SECRET_SENTINEL_DETECTED` 或调用方稳定错误，不回显值。

## Capability

只有同时具备 adapter contract test、file/DB restart test、SEC-10 fixture scan 和全量回归证据，才可把 settings capability 标为 implemented。
