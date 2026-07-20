---
doc_id: AIR-TASK-20260720-RUNWARE-PLAN
status: completed
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent, developer
source: 用户提出低成本 Runware 图片生成与设置页接入需求
---

# 任务计划：Runware 图片接入

## 目标

把 Runware 作为第四种图片 provider 接入设置、SecretStore 和现有图片网关，并按低成本草稿/参考增强分层处理当前已有生成入口。

## 非目标

- 本次不新增局部涂抹编辑器、mask 数据契约或 FLUX Fill 页面。
- 本次不训练、上传或管理 LoRA，不新增角色训练任务。
- 本次不发起真实付费图片生成；只验证密钥配置和离线请求合同。
- 不改变候选图、参考图和 Asset 的现有存储路径与来源摘要。

## 验收标准

1. 设置页可以看到、保存、清除和切换 Runware，完整 key 不返回前端、不写普通 JSON/SQLite/文档/日志。
2. Runware 无参考生成发送 `imageInference`，默认模型 `runware:100@1`；单图精修固定使用 FLUX.2 Dev `runware:400@1` 和 `referenceImages`。
3. 带角色/场景参考的候选图不会静默丢引用，改用 `runware:101@1 + runware:56@1` 并完整发送 `guideImages`。
4. Schnell/FLUX.1 Dev 尺寸按官方 `128..2048`、64 步进规范化；FLUX.2 Dev 按 `512..2048`、16 步进规范化；响应支持 `imageBase64Data`、`imageDataURI`、`imageURL`。
5. Shared、Server、Web 类型检查、相关单测和 Web 构建通过；真实设置页显示 Runware 已配置并切换生效。

## 当前阶段

阶段 6：交付与留痕（completed）

## 阶段列表

### 阶段 1：需求与事实源恢复
- [x] 理解用户意图
- [x] 读取相关事实源
- [x] 在 findings.md 记录首轮发现
- **状态：** completed

### 阶段 2：方案与拆解
- [x] 核对 Runware 官方协议与模型能力
- [x] 明确数据、协议、路径影响
- [x] 确认验收标准
- **状态：** completed

### 阶段 3：Worker 执行
- [x] 扩展共享设置契约和安全存储
- [x] 实现 Runware REST 适配与参考增强
- [x] 增加设置页选项和说明
- [x] 补单元测试
- **状态：** completed

### 阶段 4：Scrutiny Review
- [x] 静态复核代码、契约和密钥边界
- [x] 检查测试证据与 Handoff
- **状态：** completed

### 阶段 5：Runtime/User Review
- [x] 把新 key 写入本地 SecretStore
- [x] 在真实设置页验证 Runware 已配置/已切换
- [x] 确认未触发真实图片费用
- **状态：** completed

### 阶段 6：交付与留痕
- [x] 更新长期事实源
- [x] 写功能完成记录
- [x] 汇总风险和后续建议
- **状态：** completed

## 关键问题

1. 如何在不新增数据库字段的前提下区分低成本草稿与多参考候选图模型？
2. 如何保证 Runware 接入不破坏 `candidate_reference_plan_v1` 的完整参考覆盖？
3. 如何把一次性显示的 key 安全写入项目而不进入 Git、文档或命令输出？

## 已做决策

| Decision | Rationale |
| --- | --- |
| 复用现有 `ProviderConfig/CredentialMetadata/SecretStore` | 不需要新增 Schema，密钥边界与三种已有 provider 一致 |
| 设置里的 `modelId` 表示无参考草稿模型，默认 Schnell | 对应用户的低成本批量草稿目标 |
| 多参考候选固定使用 FLUX.1 Dev + FLUX IP-Adapter | Schnell 官方模型页不支持 `ipAdapters`；候选图又必须完整传入角色/场景参考 |
| 单图精修使用 FLUX.2 Dev `runware:400@1` + `referenceImages` | 与用户参考方案及 Runware 当前官方图片编辑合同一致；批量草稿仍留在 Schnell |
| inpainting/LoRA/ControlNet 页面后置 | 当前产品无 mask/训练任务契约，强行加入会形成不可用设置项 |

## 阻塞项

| Blocker | Owner | Needed Decision |
| --- | --- | --- |
| 无 | - | - |

## 遇到的错误

| Error | Attempt | Resolution |
| --- | --- | --- |
| 初次浏览器 tab 绑定失效 | 复用旧 tab id | 按浏览器技能重新列出并 claim 当前 Runware tab |
| macOS `security -w` 在生产执行器中等待 TTY，设置保存挂起 | 继续向普通 stdin 写入密钥 | 改用 Expect 私有 TTY 响应两次提示，密钥经 fd 3 传入且不进入 argv/stdout/stderr；真实 Keychain roundtrip 与设置页保存通过 |
| 首次聚焦测试使用了仓库根相对路径 | 将根路径传给 package 内 Vitest | 改为 package 内 `src/...` 路径，27/27 通过 |
| 完整测试与构建/类型检查并行时多项 5 秒集成测试超时 | 三套重任务并行 | 构建和类型检查完成后，单独重跑完整测试 |

## 退出标准

- 所有验收标准有对应测试或真实页面证据。
- Scrutiny Review 与 Runtime/User Review 均给出结论。
- 事实源、任务进度、会话记忆、完成记录和长期记忆同步。

## 当前深思熟虑角色边界

- Orchestrator 已完成事实源、方案和退出标准。
- Worker 已完成 Runware 垂直切片。
- Scrutiny Review 已只读检查 provider、设置、凭据边界、测试与差异。
- Runtime/User Review 已验证真实设置页与 Keychain 状态，未触发付费图片生成。
