---
doc_id: AIR-D2-A1-TEST-001
status: active
created: 2026-07-13
updated: 2026-07-13
owner: AI漫游项目
audience: human, ai-agent, qa
source: D2-A1 实施契约
---

# D2-A1 测试矩阵

| ID | 验证目标 | 通过标准 | 结果 |
| --- | --- | --- |
| SEC-01 | SecretString 脱敏 | `String(secret)`、JSON、inspect 均为 `[REDACTED]` | passed |
| SEC-02 | fake store put/get | get 返回原值，metadata 只含 opaque ref/fingerprint | passed |
| SEC-03 | fake store replace/delete | replace 后旧值不可读，delete 幂等且不回显旧值 | passed |
| SEC-04 | fake store root 安全 | 缺 root、symlink、文件冒充目录、路径穿越均 fail-closed | passed |
| SEC-05 | settings JSON 脱敏 | 图片 key sentinel 不出现在写后 JSON；只保留 metadata | passed |
| SEC-06 | 旧明文迁移回滚 | store 写失败时旧文件字节不变，无新明文副本；rename 失败沿用同一 fail-closed 边界 | passed（store failure） |
| SEC-07 | settings API DTO | GET/update 响应四类 provider 的 keyPreview 均为 null，不含 apiKey | passed |
| SEC-08 | DB metadata | ProviderConfig/CredentialMetadata/AppPreference 写入并重启读回，secretRef/fingerprint 正确 | passed |
| SEC-09 | runtime provider boundary | ImageProviderService 只能从 SecretStore-backed runtime 读取；无 store 返回稳定错误 | passed |
| SEC-10 | 日志/task/artifact 扫描 | fake sentinel 不出现在 DB、workspace JSON、task payload/output、异常文本和日志 | N/A（A1 无此写入路径） |
| SEC-11 | fail-closed mode | 未配置真实 adapter 时不写普通 JSON、不误报 configured、不触碰真实根 | passed |

## 命令

```bash
pnpm --filter @airoaming/server exec vitest run src/settings/secret-store.spec.ts src/settings/settings.service.spec.ts
pnpm --filter @airoaming/server typecheck
pnpm --filter @airoaming/server test
pnpm --filter @airoaming/server prisma:validate
git diff --check
```

所有带 fake store 的运行必须使用测试临时目录和唯一 sentinel；不能读取仓库 `workspace/` 或用户系统凭据库。
