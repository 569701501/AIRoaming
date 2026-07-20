---
doc_id: AIR-TASK-20260720-RUNWARE-HANDOFF
status: completed
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md, progress.md, findings.md
---

# Runware 图片接入 Handoff

## 交付结论

Runware 已成为第四个图片 Provider，并在真实设置页中配置、选中和启用。API Key 由本机 macOS Keychain 保存，前端、普通设置文件、SQLite、任务和文档均不含明文。

## 运行映射

| 产品入口 | Runware 合同 | 目的 |
| --- | --- | --- |
| 无参考生成 | FLUX.1 Schnell `runware:100@1`，4 steps | 低成本批量草稿 |
| 挑中图精修 | FLUX.2 Dev `runware:400@1`，`referenceImages`，28 steps，`CFGScale=4` | 保留主体/构图并调整动作、角度、表情与光线 |
| 带角色/场景参考的候选图 | FLUX.1 Dev `runware:101@1` + IP-Adapter `runware:56@1` | 完整消费角色与场景物理引用槽位 |

## 密钥边界

- Runware 专用 key 名称：`airoaming-local-20260720`。
- 公共 Settings 响应只确认 `configured=true`、指纹存在、`keyPreview=null`。
- macOS `security -w` 的交互提示由 Expect 私有 TTY 回答；密钥从 fd 3 传入，不进入进程参数、标准输出或标准错误。
- 不保存包含 key 明文的截图、日志或证据文件。

## 验证

| 验证 | 结果 |
| --- | --- |
| Runware/Keychain/Settings 聚焦测试 | 27/27 通过 |
| Shared 全量测试 | 167/167 通过 |
| Server 全量测试 | 822/822 通过 |
| 类型检查 | 通过 |
| 生产构建 | 通过；仅有既有 Web 大 chunk 警告 |
| 真实 Keychain 临时 roundtrip | put/get/delete 通过，临时条目已删除 |
| 真实设置页 | 保存成功、已配置、当前选中、密码框清空 |
| 真实图片生成 | 未执行，费用调用 0 |

## 残留边界

- inpainting/FLUX Fill 尚无 mask 编辑器与任务契约，不在本任务范围。
- LoRA 训练/管理和 ControlNet 尚无素材/训练/运行协议，不在本任务范围。
- 多参考合同已验证，但角色一致性视觉质量没有付费 A/B 证据。
- FLUX.2 Dev 商用前必须复核当时有效许可；若不适用，替换为具备商业许可的编辑模型。

