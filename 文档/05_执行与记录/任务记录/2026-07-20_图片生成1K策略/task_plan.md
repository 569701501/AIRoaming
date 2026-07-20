---
doc_id: AIR-TASK-20260720-IMG-1K-PLAN
status: completed
created: 2026-07-20
updated: 2026-07-20
owner: AI漫游项目
audience: human, ai-agent
source: 用户要求降低图片测试成本
---

# 图片生成 1K 策略任务计划

## 目标

将 Grok 图片生成的默认输出分辨率从 2K 降为 1K，并确保文生图、单图编辑、多图编辑走同一成本策略；需要高分辨率时允许通过运行配置显式切回 2K。

## 非目标

- 不调用真实图片 Provider。
- 不改变 OpenAI 与豆包现有尺寸协议。
- 不新增数据库列、迁移或跨 Provider 的伪统一“清晰度”字段。
- 不改变既有任务的 `requestedSize`、比例与来源摘要。

## 验收标准

1. Grok 三类图片请求默认都发送 `resolution: "1k"`。
2. `GROK_IMAGE_RESOLUTION=2k` 时三类请求都发送 `2k`。
3. 非法配置在发起网络请求前失败。
4. OpenAI、豆包请求体不受影响。
5. 单元测试、类型检查和无头/假 Provider 相关回归通过，全程零真实付费图片请求。
6. `.env.example`、生成任务契约、执行记录与长期记忆同步。

## 阶段

### 阶段 1：事实核对与方案冻结

- 核对现有请求链与三家官方参数。
- 决定在 Grok provider 边界实现运行策略。

退出标准：明确默认值、覆盖方式、失败策略和不影响范围。

### 阶段 2：Worker 实现

- 增加 Grok 分辨率解析。
- 三类 Grok 请求显式传递分辨率。
- 增加请求体和非法配置回归。

退出标准：聚焦测试和类型检查通过。

### 阶段 3：文档与复核

- 同步 `.env.example`、任务协议、完成记录和记忆。
- Scrutiny Review 只读检查差异与测试。
- Runtime Review 使用假 Provider 验证，禁止真实付费调用。

退出标准：静态复核通过，离线运行证据完整。

## 关键决策

- `requestedSize` 继续表达候选图宽高比和任务来源；Grok `resolution` 是 Provider 成本档，不能混为一个字段。
- 默认 1K 面向日常制作与测试；2K 必须通过 `GROK_IMAGE_RESOLUTION=2k` 显式启用。
- 当前不把该策略写入数据库设置页，避免为单一 Provider 参数扩张通用配置模型。

## 退出标准

- 所有验收标准满足。
- `progress.md`、`findings.md` 和完成记录完整。
- Scrutiny Review 与零付费 Runtime Review 均有结论。
