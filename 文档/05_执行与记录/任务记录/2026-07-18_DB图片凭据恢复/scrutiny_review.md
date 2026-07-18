---
doc_id: AIR-TASK-DB-IMAGE-CREDENTIAL-SCRUTINY-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer, qa
source: verified credential binder、final importer、CLI 与回归测试静态复核
---

# Scrutiny Review

## 结论

**通过。**

修复关闭了 final import “验证凭据但不绑定目标 DB 元数据”的缺口，没有破坏 shadow import 的脱敏边界，也没有引入明文 Secret 持久化。

## 静态检查

| 检查项 | 结论 |
| --- | --- |
| Secret 边界 | binder 只接收 verifier 已通过的 expectation，只写 opaque secretRef 与 fingerprint |
| 身份映射 | 仅允许 OpenAI/豆包/Grok 固定 credentialId 前缀，并严格解析目标 providerId |
| 原子性 | 多项凭据在同一 Prisma 事务绑定，任一冲突整批回滚 |
| 幂等性 | 已配置且 fingerprint 相同则保留 secretRef；二次 replay 不轮换 |
| 冲突处理 | 目标缺失、owner 错误、半配置状态、fingerprint 不同和重复目标全部 fail-closed |
| 回放授权 | 已成功 final run 只有显式 repair flag 才写入；普通 replay 仍只读返回 |
| 新迁移 | 16 个 slice 和固定验证通过后、final run 成功前自动绑定 |
| 历史保护 | 不删除或重试失败任务，不改 Candidate、Asset、角色或提示词 |

## 保留风险

- binder 当前只支持系统已存在的三种图片 Provider；未来新增 Provider 时必须显式扩充前缀映射与回归。
- 历史失败任务保持失败状态，不会自动补跑；用户未来明确再次生成时才会产生新的付费图片请求。
- 服务端重型 SQLite/CLI 测试在默认并行和固定 5 秒上限下仍有既有超时抖动；相关用例隔离复跑通过，未放宽生产规则。
