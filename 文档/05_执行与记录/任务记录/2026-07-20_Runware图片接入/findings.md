---
doc_id: AIR-TASK-20260720-RUNWARE-FINDINGS
status: completed
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: task_plan.md
---

# 发现与决策

## 需求

- 用户希望降低图片生成成本，已向 Runware 充值约 20 美元。
- 设置页需要新增 Runware provider，并创建/配置 API key。
- 参考流程为 Schnell 批量草稿、image-to-image 精修、inpainting 局部修正、LoRA/IP-Adapter 角色一致性。

## 事实源

| 文档/文件 | 结论 |
| --- | --- |
| `文档/02_架构与契约/核心数据模型.md` §17 | 图片 provider key 必须走 SecretStore；前端只读状态和指纹 |
| `文档/02_架构与契约/生成任务协议.md` | 当前 provider 网关和候选任务不能泄露 key；候选图任务必须保持来源可追溯 |
| `apps/server/src/settings/settings.service.ts` | 已有四层链路：Public DTO、Stored metadata、SecretStore、Runtime secret |
| `apps/server/src/projects/image-provider.service.ts` | 当前统一支持无参考、单参考、候选多参考三类入口 |
| `apps/server/src/projects/candidate-reference-plan.ts` | 所有必需角色/场景引用必须物理覆盖，遗漏必须 fail-closed |
| `apps/server/opencodeAI/skills/image-candidate-generate/references/provider-profiles.json` | provider 单 Prompt Profile 是生产事实源，新增 provider 必须同步 |

## 研究发现

- Runware REST 统一为 `POST https://api.runware.ai/v1`，请求体是 JSON 数组，Header 可用 Bearer key。
- FLUX.1 Schnell `runware:100@1` 适合 4 steps 低成本草图，1024² 官方标价约 `$0.0013`，但官方模型 API 未提供 `ipAdapters`。
- FLUX.2 Dev `runware:400@1` 是当前官方图片编辑路径，使用 `referenceImages`，尺寸为 `512..2048` 且按 16 步进；本任务将它用于挑中草稿后的单图精修。
- FLUX.1 Dev `runware:101@1` 支持多 IP-Adapter，允许 `runware:56@1..4`，可用 `guideImages` 数组承载角色/场景参考。
- `image-to-image` 保存像素级布局，IP-Adapter 保存特征且允许换构图；两者用途不能混为一谈。
- 当前产品没有 mask 资产、局部编辑器和 LoRA 训练任务，因此本次不能把局部修正/角色训练做成可点击但无闭环的设置项。

## 证据

| 路径/来源 | 结论 |
| --- | --- |
| https://runware.ai/docs/platform/authentication | REST 地址、数组请求和 Bearer 鉴权 |
| https://runware.ai/docs/models/bfl-flux-1-schnell | Schnell 模型 ID、尺寸、4-step 草稿与价格 |
| https://runware.ai/docs/models/bfl-flux-2-dev | FLUX.2 Dev 模型 ID、尺寸与图片编辑能力 |
| https://runware.ai/docs/models/bfl-flux-2-dev/examples | `referenceImages` 单图精修请求示例 |
| https://runware.ai/docs/models/bfl-flux-1-dev | Dev 模型 ID 和 FLUX IP-Adapter 允许值 |
| https://runware.ai/docs/learn/ip-adapters | IP-Adapter 与 image-to-image 的语义差异 |
| Runware API Keys 页面 | 新 `airoaming-local-20260720` key 已创建并 Enabled |

## 缺口与风险

| 风险 | 影响 | 建议 |
| --- | --- | --- |
| Schnell 不支持 IP-Adapter | 不能用一个 Schnell 请求完成多角色/场景一致性 | 多参考候选固定切到 Dev + IP-Adapter |
| 固定 Dev/IP-Adapter 组合尚未做真实视觉 A/B | 请求合同正确不等于角色一致性质量已证明 | 本次不付费；后续单独授权小样 A/B |
| FLUX.2 Dev 的模型授权可能不覆盖商业发行 | 商业项目直接使用存在许可风险 | 商用前核对 Black Forest Labs/Runware 当时有效许可，必要时切换商业许可模型 |
| inpainting/LoRA 无现成 UI/任务协议 | 直接加设置会造成无效承诺 | 后续独立设计 mask 与训练任务 |
| 工作区已有 Grok 默认 1K 未提交改动 | 误覆盖会破坏用户进行中的工作 | 只在共同文件做最小上下文补丁并复核 diff |

## 技术决策

| 决策 | 依据 |
| --- | --- |
| Runware 作为第四种 `ImageProviderType` | 复用当前 provider 抽象和设置交互 |
| `runwareImageProvider.modelId` 默认 Schnell | 成本目标与用户参考第一步一致 |
| 单图精修固定使用 FLUX.2 Dev `runware:400@1` | 与用户参考第二步及 Runware 当前官方 `referenceImages` 合同一致 |
| 候选多参考使用固定 Dev + `runware:56@1` | 官方兼容性 + 现有必需参考覆盖不变量 |
| Runware Reference limit 设为 10 | 与现有身份板压缩策略兼容，同时避免无限 payload |
| 仅保存 provider metadata 与 credentialRef | 保持 D74/D2 凭据分治和 DB-only 安全边界 |

## 复核发现

### Scrutiny Review

- 通过。Runware 已覆盖 Shared DTO、Settings file/DB/runtime、cutover importer、Prompt Profile、候选引用计划与三个图片网关入口；类型穷尽与差异检查通过。
- 密钥公共响应仍只有 `configured/keyFingerprint/updatedAt`，明文未进入仓库、普通设置 JSON、SQLite、任务、文档或日志。
- Runware 错误只暴露状态码/清洗后的 code；Bearer key 与响应正文不会进入错误消息。
- 无参考、单图精修、多参考三个请求合同均有 mock 测试；多参考断言全部 `guideImages` 和 `omittedRequired=[]`。

### Runtime/User Review

- 通过。Runware 页面创建并启用 `airoaming-local-20260720`；本地设置页保存成功，Runware 显示“已配置”并处于当前选中状态，密码框保存后清空。
- 生产 macOS Keychain 写入路径先暴露 TTY 挂起缺陷，修复后完成真实临时密钥 put/get/delete roundtrip，随后真实设置页保存成功。
- 本轮没有调用 Runware 图片生成接口，没有产生图片费用。

## 遇到的问题

| 问题 | 解决方案 |
| --- | --- |
| Runware 旧 key 只显示掩码，无法用于配置 | 创建新的日期专用 key，明文只在一次性弹窗与受控内存中保留 |
| 浏览器 claim 的 tab id 变化 | 重新读取开放标签并 claim 当前 Runware 页面 |
| `security add-generic-password -w` 不从普通 stdin 读取最终提示 | 使用 Expect 提供私有 TTY，秘密从 fd 3 传入，非秘密命令通过分隔环境变量传入 |
| 并行运行完整测试、构建和类型检查导致慢集成测试命中 5 秒超时 | 资源密集型验证改为顺序执行，聚焦 Runware 测试始终通过 |
