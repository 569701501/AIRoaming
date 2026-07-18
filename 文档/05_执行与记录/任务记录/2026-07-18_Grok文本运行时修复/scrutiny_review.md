---
doc_id: AIR-TASK-GROK-RUNTIME-SCRUTINY-001
status: completed
created: 2026-07-18
updated: 2026-07-18
owner: AI漫游项目
audience: human, ai-agent, developer
source: 代码差异、测试结果、架构与秘密边界
---

# Grok 文本运行时静态复核

## 结论

通过。修复范围与根因一致，没有改变剧本、剧情结构、分镜或图片生成协议。

## 复核要点

- 业务逻辑 ID `xai` 与 OpenCode 运行时 ID `airoaming_xai` 明确分离，页面与历史消息无需迁移。
- 自定义 Base URL 使用 `@ai-sdk/openai-compatible`，模型显式进入 `provider.models`，避免 OpenCode 保留 `xai` 适配器冲突。
- Provider 配置不含密钥；密钥继续通过独立 auth 接口同步。
- 模型列表只读取运行时真实配置；注册失败时返回空列表，不再制造可选但不可调用的模型。
- AI漫游只重启自己持有的 OpenCode 子进程；显式外部 OpenCode 不被停止或改写。
- 同地址同指纹冷启动恢复只复用同一份 SecretStore 凭据；不匹配时保持秘密隔离。
- 回归覆盖 Provider 映射、auth、消息模型 ID、未注册模型隐藏和冷启动恢复。

## 残留风险

- 外部 OpenCode 模式需要运维侧预先注册相同 Provider。
- 文本与图片不是同一凭据时，历史文本 auth 无法自动迁移，用户需重新保存文本 Key。
- 全仓并行运行仍有一个无关的固定 5 秒测试资源竞争，本次未调整其测试策略。
